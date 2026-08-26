import { call, put, takeEvery, select } from 'redux-saga/effects'
import actions from '../actions/actionTypes'
import {
	lottieImportFileSuccess,
	lottieImportFileFailed,
} from '../actions/importActions'
import fileBrowser from '../../helpers/FileBrowser'
import storingPathsSelector from '../selectors/storing_paths_selector'

function *importLottieFile(action) {
	try{
		let paths = yield select(storingPathsSelector)
		let fileData = yield call(fileBrowser, paths.importPath)
		yield put(lottieImportFileSuccess(fileData.fsName))
	} catch(err) {
		yield put(lottieImportFileFailed())
	}
}

export default [
  takeEvery(actions.IMPORT_LOTTIE_IMPORT_FILE, importLottieFile),
]
