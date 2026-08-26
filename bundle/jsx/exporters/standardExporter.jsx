/*jslint vars: true , plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global File, Folder, $*/

$.__bodymovin.bm_standardExporter = (function () {

	var bm_fileManager = $.__bodymovin.bm_fileManager;
	var exporterHelpers = $.__bodymovin.bm_exporterHelpers;
	var bm_eventDispatcher = $.__bodymovin.bm_eventDispatcher;
	var ob = {}
	var _callback;
	var _destinationData;
	var _transaction;

	function copyAssets() {

		var rawFiles = bm_fileManager.getFilesOnPath(['raw']);
		var i = 0, len = rawFiles.length;
		var copiedFileIds = [];
		try {
		while(i < len) {
			var fileData = bm_fileManager.getFileById(rawFiles[i].id);
			if (fileData) {
				var file = fileData.file;
				if(file.exists) {
					var filePath = fileData.path;
					var j = 1, jLen = filePath.length;
					var destinationFolder = ['standard'];
					while (j < jLen) {
						destinationFolder.push(filePath[j]);
						j += 1;
					}
					var destinationFileData = bm_fileManager.createFile(fileData.name, destinationFolder);
					copiedFileIds.push(destinationFileData.id);
					exporterHelpers.copyFile(file, destinationFileData.file);
				}
			}
			i += 1;
		}
		} catch (error) {
			for (i = 0; i < copiedFileIds.length; i += 1) {
				try {
					bm_fileManager.removeFile(copiedFileIds[i]);
				} catch (cleanupError) {
					// Cleanup must not obscure the original copy error.
				}
			}
			throw error;
		}
	}

	function moveAssetsToDestination() {
		var rawFiles = bm_fileManager.getFilesOnPath(['standard']);
		var i = 0, len = rawFiles.length;
		while(i < len) {
			var fileData = bm_fileManager.getFileById(rawFiles[i].id);
			if (fileData) {
				var file = fileData.file;
				if(file.exists) {
					var filePath = fileData.path;
					var j = 1, jLen = filePath.length;
					var destinationFolder = new Folder(_destinationData.folder.fsName);
					while (j < jLen) {
						destinationFolder.changePath(filePath[j]);
						exporterHelpers.ensureFolder(destinationFolder);
						j += 1;
					}
					var destinationFile = new File(destinationFolder.fsName);
					destinationFile.changePath(fileData.name);
					exporterHelpers.copyFile(file, destinationFile, _transaction);
				}
			}
			i += 1;
		}
		exporterHelpers.commitTransaction(_transaction);
		_transaction = null;
		finish(exporterHelpers.exportStatuses.SUCCESS);
	}

	function fail() {
		if (_transaction) {
			try {
				exporterHelpers.rollbackTransaction(_transaction);
			} catch (rollbackError) {
				// Preserve failed completion even if Adobe cannot restore a destination.
			} finally {
				_transaction = null;
				finish(exporterHelpers.exportStatuses.FAILED);
			}
		} else {
			finish(exporterHelpers.exportStatuses.FAILED);
		}
	}

	function finish(status) {
		if (_callback) {
			var callback = _callback;
			_callback = null;
			callback(exporterHelpers.exportTypes.STANDARD, status);
		}
	}
	
	function save(destinationPath, config, callback) {

		_callback = callback;
		_transaction = exporterHelpers.createTransaction();
		try {

		if (config.export_modes.standard) {
			_destinationData = exporterHelpers.parseDestination(destinationPath, '');

			var destinationFile = new File(_destinationData.folder.fsName);
			destinationFile.changePath(_destinationData.fileName + '.json');

			copyAssets();

			if (config.segmented) {

				var temporaryFolder = bm_fileManager.getTemporaryFolder();
				var originFolder = new Folder(temporaryFolder.fsName);
				originFolder.changePath('raw');
				var destinationFolder = new Folder(temporaryFolder.fsName);
				destinationFolder.changePath('standard');

				bm_eventDispatcher.sendEvent('bm:split:animation', 
				{
					origin: originFolder.fsName, 
					destination: destinationFolder.fsName,
					fileName: _destinationData.fileName,
					time: config.segmentedTime,
				});
				
			} 
			
			else {
				moveAssetsToDestination();
			}

		} else {
			_transaction = null;
			finish(exporterHelpers.exportStatuses.SUCCESS);
		}
		} catch (error) {
			fail();
		}

	}

	function splitSuccess(totalSegments) {
		try {
			for (var i = 0; i < totalSegments; i += 1) {
				bm_fileManager.createFile(_destinationData.fileName  + '_' + i + '.json', ['standard']);
			}
			moveAssetsToDestination();
		} catch (error) {
			fail();
		}
	}

	function splitFailed() {
		fail();
	}

	ob.save = save;
	ob.splitSuccess = splitSuccess;
	ob.splitFailed = splitFailed;
	
	return ob;
}());
