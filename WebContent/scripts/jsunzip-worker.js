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

importScripts('jsunzip.js');

(function() {

	var index;

	onmessage = function(event) {
		var data = event.data, instance, isZipFile;

		if (data.message == "parse") {
			JSUnzip.instance = instance = new JSUnzip(data.content);
			index = 0;
			isZipFile = instance.isZipFile();
			if (isZipFile)
				instance.readEntries(data.name, data.content);
			postMessage({
				message : "parse",
				entriesLength : isZipFile ? instance.entries.length : 0,
				isZipFile : isZipFile
			});
		}
		if (data.message == "getNextEntry") {
			var zipEntry, uncompressedData, utf8ArrayBuffer, uint8Array, blobBuilder = WebKitBlobBuilder ? new WebKitBlobBuilder()
					: BlobBuilder ? new BlobBuilder() : null;
			zipEntry = JSUnzip.instance.entries[index];
			if (zipEntry) {
				var zipData = zipEntry.getData();
				uncompressedData = zipEntry.compressionMethod == 0 ? zipData : zipEntry.compressionMethod == 8 ? JSInflate.inflate(zipData) : null;
				utf8ArrayBuffer = new ArrayBuffer(uncompressedData.length);
				uint8Array = new Uint8Array(utf8ArrayBuffer);
				uint8Array.set(uncompressedData);
				blobBuilder.append(utf8ArrayBuffer);
				postMessage({
					message : "getNextEntry",
					index : index,
					filename : zipEntry.fileName,
					file : blobBuilder.getBlob()
				});
				index++;
			} else
				JSUnzip.instance = null;
		}
	};

})();