/*jslint vars: true , plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global File, Folder, $*/

$.__bodymovin.bm_exporterHelpers = (function () {

	var bm_fileManager = $.__bodymovin.bm_fileManager;
	var bm_eventDispatcher = $.__bodymovin.bm_eventDispatcher;
	var JSON = $.__bodymovin.JSON;

	var ob = {}

	function assertSuccess(result, message) {
		if (result === false) {
			throw new Error(message);
		}
	}

	function closeQuietly(file) {
		try {
			file.close();
		} catch (error) {
			// Preserve the original I/O error.
		}
	}

	function removeQuietly(file) {
		try {
			file.remove();
		} catch (error) {
			// Cleanup must not obscure the original I/O error.
		}
	}

	function ensureFolder(folder) {
		if (!folder.exists) {
			assertSuccess(folder.create(), 'Could not create folder: ' + folder.fsName);
		}
	}

	function readTextFile(file) {
		var isOpen = false;
		try {
			assertSuccess(file.open('r'), 'Could not open file for reading: ' + file.fsName);
			isOpen = true;
			var content = file.read();
			assertSuccess(content, 'Could not read file: ' + file.fsName);
			assertSuccess(file.close(), 'Could not close file: ' + file.fsName);
			isOpen = false;
			return content;
		} catch (error) {
			if (isOpen) {
				closeQuietly(file);
			}
			throw error;
		}
	}

	function writeTextFile(file, content) {
		var isOpen = false;
		try {
			assertSuccess(file.open('w', 'TEXT', '????'), 'Could not open file for writing: ' + file.fsName);
			isOpen = true;
			file.encoding = 'UTF-8';
			assertSuccess(file.write(content), 'Could not write file: ' + file.fsName);
			assertSuccess(file.close(), 'Could not close file: ' + file.fsName);
			isOpen = false;
		} catch (error) {
			if (isOpen) {
				closeQuietly(file);
			}
			removeQuietly(file);
			throw error;
		}
	}

	function copyFile(file, destinationFile) {
		try {
			assertSuccess(file.copy(destinationFile.fsName), 'Could not copy file to: ' + destinationFile.fsName);
		} catch (error) {
			removeQuietly(destinationFile);
			throw error;
		}
	}

	function getJsonData(rawFiles) {
		var i = 0, len = rawFiles.length;
		while(i < len) {
			if(rawFiles[i].type === 'main') {
				break;
			}
			i += 1;
		}
		var fileData = bm_fileManager.getFileById(rawFiles[i].id);
		var jsonFile = fileData.file;
		return readTextFile(jsonFile);
	}

	function saveAssets(rawFiles, destinationFolder) {
		var i = 0, len = rawFiles.length;
		var copiedFiles = [];
		// TODO improve this solution
		try {
		while(i < len) {
			if(rawFiles[i].type !== 'main') {
				var fileData = bm_fileManager.getFileById(rawFiles[i].id);
				if (fileData) {
					var file = fileData.file;
					if(file.exists) {
						var destinationFileFolder = new Folder(destinationFolder.fsName);
						// TODO improve this solution even more
						destinationFileFolder.changePath('images');
						ensureFolder(destinationFileFolder);
						var destinationFile = new File(destinationFileFolder.fsName);
						destinationFile.changePath(file.name);
						copyFile(file, destinationFile);
						copiedFiles.push(destinationFile);
					}
				}
			}
			i += 1;
		}
		} catch (error) {
			for (i = 0; i < copiedFiles.length; i += 1) {
				removeQuietly(copiedFiles[i]);
			}
			throw error;
		}
		return copiedFiles;
	}

	function parseDestination(destinationPath, subFolder) {
		var destinationFile = new File(destinationPath);
		var destinationFolder = new Folder(destinationFile.parent);
		if (subFolder) {
			destinationFolder.changePath(subFolder);
			ensureFolder(destinationFolder);
		}
		var destinationFileName = destinationFile.name;
        var destinationFileNameWithoutExtension = destinationFileName.substr(0, destinationFileName.lastIndexOf('.'));
        var destinationExtension = destinationFileName.substr(destinationFileName.lastIndexOf('.') + 1);

        return {
        	extension: destinationExtension,
        	file: destinationFile,
        	fileName: destinationFileNameWithoutExtension,
        	folder: destinationFolder,
        	fullFileName: destinationFileName,
        }
	}


	ob.getJsonData = getJsonData;
	ob.copyFile = copyFile;
	ob.ensureFolder = ensureFolder;
	ob.removeQuietly = removeQuietly;
	ob.removeFilesQuietly = function (files) {
		for (var i = 0; i < files.length; i += 1) {
			removeQuietly(files[i]);
		}
	};
	ob.saveAssets = saveAssets;
	ob.parseDestination = parseDestination;
	ob.writeTextFile = writeTextFile;
	
	ob.exportTypes = {
		DEMO: 'demo',
		STANDALONE: 'standalone',
		STANDARD: 'standard',
	};

	ob.exportStatuses = {
		IDLE: 'idle',
		SUCCESS: 'success',
		FAILED: 'failed',
	};
    
    return ob;
}());
