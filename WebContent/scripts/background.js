/*
 * Copyright 2011 Gildas Lormeau
 * contact : gildas.lormeau <at> gmail.com
 * 
 * This file is part of ZipTabs.
 *
 *   ZipTabs is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU Lesser General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   ZipTabs is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU Lesser General Public License for more details.
 *
 *   You should have received a copy of the GNU Lesser General Public License
 *   along with ZipTabs.  If not, see <http://www.gnu.org/licenses/>.
 */

(function(globalObject) {

	var dev = false;

	var SINGLE_FILE_ID = dev ? "onlinihoegnbbcmeeocfeplgbkmoidla" : "jemlklgaibiijojffihnhieihhagocma";
	var STATE = {
		IDLE : 0,
		EXPORTING : 1,
		IMPORTING : 2
	};
	var EMPTY_FUNCTION = function() {
	};

	var state = STATE.IDLE;

	function WatchDog(resetFn) {
		var timeout, that = this;

		that.reset = function() {
			if (timeout)
				clearTimeout(timeout);
			timeout = null;
		};

		that.set = function() {
			that.reset();
			timeout = setTimeout(function() {
				var notificationNoResponse = webkitNotifications.createHTMLNotification('notification-abort.html');
				notificationNoResponse.show();
				setTimeout(function() {
					notificationNoResponse.cancel();
				}, 3000);
				resetFn();
				timeout = null;
			}, 90000);
		};
	}

	function terminateProcess(worker, watchdog) {
		chrome.browserAction.setBadgeText({
			text : ""
		});
		chrome.browserAction.setTitle({
			title : ""
		});
		worker.terminate();
		state = STATE.IDLE;
		watchdog.reset();
	}

	globalObject.ziptabs = {
		idle : function() {
			return state == STATE.IDLE;
		},
		detectSingleFile : function(callback) {
			var img = new Image();
			img.src = "chrome-extension://" + SINGLE_FILE_ID + "/resources/icon_16.png";
			img.onload = function() {
				callback(true);
			};
			img.onerror = function() {
				callback(false);
			};
		},
		refreshPopup : EMPTY_FUNCTION,
		exportTabs : function(tabIds) {
			var zipWorker = new Worker("../scripts/jszip-worker.js"), index = 0, max = tabIds.length, watchdog = new WatchDog(terminate), tabs = {};

			function onProgress(tabId, tab) {
				if (tab)
					tabs[tabId] = tab;
				chrome.extension.getViews({
					type : "popup"
				}).forEach(function(popup) {
					popup.ziptabs.onTabProgress(tabId, tabs[tabId].state, tabs[tabId].index, tabs[tabId].max);
				});
			}

			function terminate() {
				globalObject.ziptabs.refreshPopup = EMPTY_FUNCTION;
				terminateProcess(zipWorker, watchdog);
			}

			function singleFileListener(request, sender, sendResponse) {
				var tabId = request.tabId;
				if (request.processProgress)
					onProgress(tabId, {
						index : request.tabIndex,
						max : request.tabMaxIndex,
						state : 1
					});
				else if (request.processEnd) {
					zipWorker.postMessage({
						message : "add",
						name : (request.title.replace(/[\\\/:\*\?\"><|]/gi, "").trim() || "Untitled") + " (" + tabId + ").html",
						content : request.content.replace(/<meta[^>]*http-equiv\s*=\s*["']?content-type[^>]*>/gi, "").replace(/<meta[^>]*charset\s*=[^>]*>/gi,
								""),
						id : tabId
					});
					sendResponse({});
				}
			}

			function workerOnmessage(event) {
				var data = event.data;
				if (data.message == "generate") {
					terminate();
					chrome.tabs.create({
						url : webkitURL.createObjectURL(data.zip),
						selected : false
					});
				}
				if (data.message == "add") {
					onProgress(data.id, {
						state : 2
					});
					watchdog.set();
					index++;
					if (index == max) {
						chrome.extension.onRequestExternal.removeListener(singleFileListener);
						zipWorker.postMessage({
							message : "generate"
						});
					}
					chrome.browserAction.setBadgeText({
						text : Math.floor((index / max) * 100) + "%"
					});
					chrome.browserAction.setTitle({
						title : "Exporting tabs..."
					});
				}
			}

			globalObject.ziptabs.refreshPopup = function() {
				tabIds.forEach(function(tabId) {
					onProgress(tabId);
				});
			};
			state = STATE.EXPORTING;
			watchdog.set();
			zipWorker.onmessage = workerOnmessage;
			zipWorker.postMessage({
				message : "new"
			});
			tabIds.forEach(function(tabId) {
				onProgress(tabId, {
					index : 0,
					max : 100,
					state : 0
				});
			});
			chrome.extension.onRequestExternal.addListener(singleFileListener);
			chrome.extension.sendRequest(SINGLE_FILE_ID, {
				tabIds : tabIds
			}, function() {
			});
		}
	};

	webkitRequestFileSystem(TEMPORARY, 100 * 1024 * 1024, function(filesystem) {
		var indexFile = 0;

		function cleanFilesystem(callback) {
			rootReader = filesystem.root.createReader("/");
			rootReader.readEntries(function(entries) {
				var i = 0;

				function removeNextEntry() {
					function next() {
						i++;
						removeNextEntry();
					}

					if (i < entries.length)
						entries[i].remove(next, next);
					else
						callback();
				}

				removeNextEntry();
			}, callback);
		}

		function setImportTabs() {
			globalObject.ziptabs.importTabs = function(file) {
				var index = 0, max = 0, fileReader = new FileReader(), watchdog = new WatchDog(terminate), unzipWorker = new Worker(
						"../scripts/jsunzip-worker.js");

				function terminate() {
					terminateProcess(unzipWorker, watchdog);
				}

				state = STATE.IMPORTING;
				fileReader.onloadend = function(event) {
					unzipWorker.onmessage = function(event) {
						var data = event.data;

						function nextFile() {
							chrome.browserAction.setBadgeText({
								text : Math.floor((index / max) * 100) + "%"
							});
							chrome.browserAction.setTitle({
								title : "Importing archives..."
							});
							if (index == max)
								terminate();
							else {
								index++;
								unzipWorker.postMessage({
									message : "getNextEntry"
								});
								watchdog.set();
							}
						}

						function openFile() {
							filesystem.root.getFile((indexFile++) + ".html", {
								create : true
							}, function(fileEntry) {
								fileEntry.createWriter(function(fileWriter) {
									fileWriter.onwrite = function(event) {
										chrome.tabs.create({
											url : fileEntry.toURL(),
											selected : false
										}, nextFile);
									};
									fileWriter.onerror = nextFile;
									fileWriter.write(data.file);
								}, nextFile);
							}, nextFile);
						}

						if (data.message == "parse") {
							max = data.entriesLength;
							nextFile();
						}
						if (data.message == "getNextEntry")
							if (/.html$|.htm$/.test(data.filename.trim()))
								openFile();
							else
								nextFile();
					};
					unzipWorker.postMessage({
						message : "parse",
						content : event.target.result
					});
					watchdog.set();
				};
				fileReader.readAsBinaryString(file);
			};
		}

		cleanFilesystem(setImportTabs);
	});

	chrome.browserAction.setBadgeBackgroundColor({
		color : [ 4, 229, 36, 255 ]
	});

})(window);