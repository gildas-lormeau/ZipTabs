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

	var ziptabs = chrome.extension.getBackgroundPage().ziptabs;

	function display(tabs) {
		var tempElement = document.createElement("ul"), ulElement = document.getElementById("tabs-list");
		tabs.forEach(function(tab) {
			var liElement, cbElement, aElement, favicoElement;
			if (tab.url.indexOf("https://chrome.google.com") == 0 || !(tab.url.indexOf("http://") == 0 || tab.url.indexOf("https://") == 0))
				return;
			aElement = document.createElement("a");
			favicoElement = document.createElement("img");
			liElement = document.createElement("li");
			cbElement = document.createElement("input");
			progressElement = document.createElement("progress");
			liElement.appendChild(cbElement);
			liElement.appendChild(favicoElement);
			liElement.appendChild(aElement);
			liElement.appendChild(progressElement);
			tempElement.appendChild(liElement);
			aElement.className = "tabs-tab-title";
			aElement.href = "#";
			aElement.title = tab.title;
			aElement.addEventListener("click", function() {
				chrome.tabs.update(tab.id, {
					selected : true
				});
			}, false);
			favicoElement.src = tab.favIconUrl ? tab.favIconUrl : "../resources/default-favico.gif";
			favicoElement.className = "tabs-tab-favico";
			liElement.id = "tabs-tab-" + tab.id;
			cbElement.type = "checkbox";
			cbElement.title = "select a tab to archive";
			cbElement.checked = true;
			aElement.textContent = tab.title;
			progressElement.className = "tabs-tab-progress";
			progressElement.hidden = true;
		});
		tempElement.id = ulElement.id;
		tempElement.className = ulElement.className;
		ulElement.parentElement.replaceChild(tempElement, ulElement);
		ulElement = tempElement;
	}

	globalObject.ziptabs = {
		onTabProgress : function(tabId, state, index, max) {
			console.log("onTabProgress", tabId, state, index, max);
			var progressElement, checkboxElement, titleElement, tabElement = document.getElementById("tabs-tab-" + tabId);
			if (tabElement) {
				progressElement = tabElement.querySelector("progress");
				checkboxElement = tabElement.querySelector("input[type=checkbox]");
				titleElement = tabElement.querySelector(".tabs-tab-title");
				checkboxElement.checked = false;
				if (progressElement.hidden)
					progressElement.hidden = false;
				// FIXME weird bug : hack to force progress bars to be displayed/hidden
				document.getElementById("main").style.height = "auto";
				checkboxElement.disabled = true;
				titleElement.className = "tabs-tab-title saving";
				if ((state == 1 || state == 2) && max) {
					index = state == 1 ? index : state == 2 ? max + index : 0;
					max = max * 2;
					progressElement.value = index;
					progressElement.max = max;
					progressElement.title = "progress: " + Math.floor((index * 100) / max) + "%";
					progressElement.className = "tabs-tab-progress " + (state == 1 ? "pass-one" : state == 2 ? "pass-two" : "");
				} else {
					checkboxElement.disabled = false;
					titleElement.className = "tabs-tab-title";
					progressElement.hidden = true;
				}
			}
		}
	};
	document.getElementById("tabs-open-action").addEventListener("change", function() {
		if (ziptabs.idle())
			ziptabs.importTabs(event.target.files[0]);
	}, false);
	document.getElementById("tabs-zip-action").addEventListener("click", function() {
		var selectedIds = [], filename;
		Array.prototype.forEach.call(document.querySelectorAll("input[type=checkbox]"), function(inputElement) {
			if (inputElement.checked)
				selectedIds.push(Number(inputElement.parentElement.id.split("tabs-tab-")[1]));
		});
		if (selectedIds.length && ziptabs.idle()) {
			filename = prompt("Filename:", "ZipTabs - " + (new Date()).toDateString() + ".zip");
			if (filename)
				ziptabs.exportTabs(selectedIds, filename);
		}
	}, false);
	ziptabs.detectSingleFile(function(detected) {
		var main = document.getElementById("main");
		if (!detected) {
			main.hidden = true;
			document.getElementById("error").hidden = false;
		} else
			chrome.tabs.getAllInWindow(null, function(tabs) {
				display(tabs);
				ziptabs.refreshPopup();
				main.hidden = false;
			});
	});

})(window);