/*jslint vars: true , plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global File, Folder, $*/

$.__bodymovin.bm_exporterHelpers = (function () {

	var bm_fileManager = $.__bodymovin.bm_fileManager;
	var bm_eventDispatcher = $.__bodymovin.bm_eventDispatcher;
	var JSON = $.__bodymovin.JSON;
	var temporaryFileCounter = 0;

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

	function createSiblingTemporaryFile(destinationFile, label) {
		var temporaryFile;
		do {
			temporaryFileCounter += 1;
			temporaryFile = new File(destinationFile.fsName + '.bodygroovn-' + label + '-' + temporaryFileCounter);
		} while (temporaryFile.exists);
		return temporaryFile;
	}

	function createTransaction() {
		return {
			records: [],
		};
	}

	function commitRecord(record) {
		if (record.backupFile) {
			removeQuietly(record.backupFile);
		}
	}

	function rollbackRecord(record) {
		var rollbackError;
		try {
			assertSuccess(record.outputFile.remove(), 'Could not remove failed output: ' + record.outputFile.fsName);
		} catch (error) {
			rollbackError = error;
		}
		if (record.backupFile) {
			try {
				assertSuccess(record.backupFile.rename(record.destinationName), 'Could not restore existing file: ' + record.outputFile.fsName);
			} catch (restoreError) {
				rollbackError = rollbackError || restoreError;
			}
		}
		if (rollbackError) {
			throw rollbackError;
		}
	}

	function commitTransaction(transaction) {
		for (var i = 0; i < transaction.records.length; i += 1) {
			commitRecord(transaction.records[i]);
		}
		transaction.records = [];
	}

	function rollbackTransaction(transaction) {
		var rollbackError;
		for (var i = transaction.records.length - 1; i >= 0; i -= 1) {
			try {
				rollbackRecord(transaction.records[i]);
			} catch (error) {
				rollbackError = rollbackError || error;
			}
		}
		transaction.records = [];
		if (rollbackError) {
			throw rollbackError;
		}
	}

	function replaceWithTemporaryFile(destinationFile, temporaryFile, transaction) {
		var destinationExisted = destinationFile.exists;
		var destinationFsName = destinationFile.fsName;
		var destinationName = destinationFile.name;
		var backupFile;

		if (destinationExisted) {
			backupFile = createSiblingTemporaryFile(destinationFile, 'backup');
			assertSuccess(destinationFile.rename(backupFile.name), 'Could not prepare existing file for replacement: ' + destinationFile.fsName);
		}

		try {
			assertSuccess(temporaryFile.rename(destinationName), 'Could not replace file: ' + destinationFile.fsName);
		} catch (error) {
			var restoreError;
			if (destinationExisted) {
				if (backupFile.rename(destinationName) === false) {
					restoreError = new Error('Could not restore existing file after replacement failure: ' + destinationFile.fsName);
				}
			}
			removeQuietly(temporaryFile);
			if (restoreError) {
				throw restoreError;
			}
			throw error;
		}

		var record = {
			backupFile: backupFile,
			destinationName: destinationName,
			outputFile: new File(destinationFsName),
		};
		if (transaction) {
			transaction.records.push(record);
		} else {
			commitRecord(record);
		}
		return !destinationExisted;
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

	function writeTextFile(file, content, transaction) {
		var temporaryFile = createSiblingTemporaryFile(file, 'write');
		var isOpen = false;
		try {
			assertSuccess(temporaryFile.open('w', 'TEXT', '????'), 'Could not open file for writing: ' + file.fsName);
			isOpen = true;
			temporaryFile.encoding = 'UTF-8';
			assertSuccess(temporaryFile.write(content), 'Could not write file: ' + file.fsName);
			assertSuccess(temporaryFile.close(), 'Could not close file: ' + file.fsName);
			isOpen = false;
			return replaceWithTemporaryFile(file, temporaryFile, transaction);
		} catch (error) {
			if (isOpen) {
				closeQuietly(temporaryFile);
			}
			removeQuietly(temporaryFile);
			throw error;
		}
	}

	function copyFile(file, destinationFile, transaction) {
		var temporaryFile = createSiblingTemporaryFile(destinationFile, 'copy');
		try {
			assertSuccess(file.copy(temporaryFile.fsName), 'Could not copy file to: ' + destinationFile.fsName);
			return replaceWithTemporaryFile(destinationFile, temporaryFile, transaction);
		} catch (error) {
			removeQuietly(temporaryFile);
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

	function saveAssets(rawFiles, destinationFolder, transaction) {
		var i = 0, len = rawFiles.length;
		// TODO improve this solution
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
						copyFile(file, destinationFile, transaction);
					}
				}
			}
			i += 1;
		}
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
	ob.commitTransaction = commitTransaction;
	ob.copyFile = copyFile;
	ob.createTransaction = createTransaction;
	ob.ensureFolder = ensureFolder;
	ob.removeQuietly = removeQuietly;
	ob.removeFilesQuietly = function (files) {
		for (var i = 0; i < files.length; i += 1) {
			removeQuietly(files[i]);
		}
	};
	ob.rollbackTransaction = rollbackTransaction;
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
