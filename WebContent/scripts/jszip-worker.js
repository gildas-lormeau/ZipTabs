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

importScripts('jszip.js');
importScripts('jszip-deflate.js');

onmessage = function(event) {
	var data = event.data;
	if (data.message == "new")
		JSZip.instance = new JSZip("DEFLATE", true);
	if (data.message == "add") {
		JSZip.instance.add(data.name, data.content);
		postMessage({
			message : "add",
			name : data.name,
			id : data.id
		});
	}
	if (data.message == "generate") {
		postMessage({
			message : "generate",
			zip : JSZip.instance.generate(true)
		});
	}
};