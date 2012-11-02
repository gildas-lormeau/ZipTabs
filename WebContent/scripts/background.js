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
	var createFile, cleanFilesystem;

	function getValidFileName(fileName) {
		return fileName.replace(/[\\\/:\*\?\"><|]/gi, "").trim();
	}

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
				var notificationNoResponse = webkitNotifications.createHTMLNotification("pages/notification-abort.html");
				notificationNoResponse.show();
				setTimeout(function() {
					notificationNoResponse.cancel();
				}, 3000);
				resetFn();
				timeout = null;
			}, 90000);
		};
	}

	function terminateProcess(process, watchdog) {
		function end() {
			chrome.browserAction.setBadgeText({
				text : ""
			});
			chrome.browserAction.setTitle({
				title : ""
			});
			state = STATE.IDLE;
			watchdog.reset();
		}

		if (process)
			process.close(end);
		else
			end();
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
		exportTabs : function(tabIds, filename) {
			var zipWriter, file, index = 0, max = tabIds.length, watchdog = new WatchDog(terminate), tabs = {};

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
				terminateProcess(zipWriter, watchdog);
				zipWriter = null;
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
					var content, filename, blob;
					content = request.content.replace(/<meta[^>]*http-equiv\s*=\s*["']?content-type[^>]*>/gi, "").replace(/<meta[^>]*charset\s*=[^>]*>/gi, "");
					filename = (request.title.replace(/[\\\/:\*\?\"><|]/gi, "").trim() || "Untitled") + " (" + tabId + ").html";
					blob = new Blob([ new Uint8Array([ 0xEF, 0xBB, 0xBF ]), content ], {
						type : "text/html"
					});
					zipWriter.add(filename, new zip.BlobReader(blob), function() {
						onProgress(tabId, {
							state : 2
						});
						watchdog.set();
						index++;
						if (index == max) {
							chrome.extension.onMessageExternal.removeListener(singleFileListener);
							zipWriter.close(function() {
								chrome.tabs.create({
									url : file.toURL(),
									selected : false
								});
								zipWriter = null;
								terminate();
							});
						} else
							chrome.extension.sendMessage(SINGLE_FILE_ID, {
								tabIds : [ tabIds[index] ]
							}, function() {
							});
						chrome.browserAction.setBadgeText({
							text : Math.floor((index / max) * 100) + "%"
						});
						chrome.browserAction.setTitle({
							title : "Exporting tabs..."
						});
					}, function(current, total) {
						onProgress(tabId, {
							index : current,
							max : total,
							state : 2
						});
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
			tabIds.forEach(function(tabId) {
				onProgress(tabId, {
					index : 0,
					max : 100,
					state : 0
				});
			});
			chrome.extension.onMessageExternal.addListener(singleFileListener);
			cleanFilesystem(function() {
				createFile(filename, function(outputFile) {
					file = outputFile;
					zip.createWriter(new zip.FileWriter(outputFile), function(writer) {
						zipWriter = writer;
						chrome.extension.sendMessage(SINGLE_FILE_ID, {
							tabIds : [ tabIds[index] ]
						}, function() {
						});
					}, onerror);
				});
			});
		},
		importTabs : function(inputFile) {
			var watchdog = new WatchDog(terminate), zipReader;

			function terminate() {
				terminateProcess(zipReader, watchdog);
			}

			zip.createReader(new zip.BlobReader(inputFile), function(reader) {
				zipReader = reader;
				zipReader.getEntries(function(entries) {
					function getEntry(index) {
						var entry = entries[index];

						function nextFile() {
							chrome.browserAction.setBadgeText({
								text : Math.floor((index / entries.length) * 100) + "%"
							});
							chrome.browserAction.setTitle({
								title : "Importing archives..."
							});
							if (index == entries.length - 1)
								terminate();
							else {
								getEntry(index + 1);
								watchdog.set();
							}
						}

						if (entry && /.html$|.htm$/.test(entry.filename))
							createFile(index + ".html", function(file) {
								entry.getData(new zip.FileWriter(file), function() {
									chrome.tabs.create({
										url : file.toURL(),
										selected : false
									}, nextFile);
								}, function(current, total) {
									chrome.browserAction.setBadgeText({
										text : Math.floor((index / entries.length) * 100 + ((current / total) * (100 / entries.length))) + "%"
									});
								});
							}, !index);
						else
							nextFile();
					}

					cleanFilesystem(function() {
						getEntry(0);
					});
				}, onerror);
				watchdog.set();
			}, onerror);

			state = STATE.IMPORTING;
		}
	};

	zip.workerScriptsPath = "scripts/";
	webkitRequestFileSystem(TEMPORARY, 1024 * 1024 * 1024, function(filesystem) {
		cleanFilesystem = function(callback) {
			var rootReader = filesystem.root.createReader("/");
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
		};
		createFile = function(filename, callback) {
			filename = getValidFileName(filename);
			filesystem.root.getFile(filename, {
				create : true
			}, callback, callback);
		};
	});

	chrome.browserAction.setBadgeBackgroundColor({
		color : [ 4, 229, 36, 255 ]
	});

})(window);
