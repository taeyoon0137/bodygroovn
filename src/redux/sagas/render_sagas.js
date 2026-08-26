import { call, take, put, takeEvery, fork, select, all } from 'redux-saga/effects'
import actions from '../actions/actionTypes'
import {saveFontsFromLocalStorage, getFontsFromLocalStorage} from '../../helpers/localStorageHelper'
import {setFonts, imageProcessed, imageProcessingFailed, expressionProcessed} from '../../helpers/CompositionsProvider'
import renderFontSelector from '../selectors/render_font_selector'
import setFontsSelector from '../selectors/set_fonts_selector'
import globalSettingsSelector from '../selectors/global_settings_selector'
import imageProcessor from '../../helpers/ImageProcessorHelper'
import {getEncodedFile} from '../../helpers/FileLoader'
import expressionProcessor from '../../helpers/expressions/expressions'

function *searchStoredFonts(action) {
	try{
		let storedFonts = yield call(getFontsFromLocalStorage, action.data.fonts)
		const {
			shouldReuseFontData,
		} = yield select(globalSettingsSelector);

		// If reusing font data is enabled and there is no missing font data, we return to the exporter.
		if (shouldReuseFontData) {
			const missingFont = storedFonts.some(fontData => fontData.data === null);
			if (!missingFont) {
				const fontsData = storedFonts.map(font => font.data);
				yield call(setFonts, fontsData, action.data.render_generation);
				return;
			}
		}
		yield put({ 
				type: actions.RENDER_STORED_FONTS_FETCHED,
				storedFonts: storedFonts
		})
	} catch(err) {
	}
}

export function *handleRenderFonts(action) {
	if (!action.data.bundleFonts) {
		yield call(searchStoredFonts, action)
	} else {
		let fontsInfo = yield select(setFontsSelector)
		fontsInfo = fontsInfo.map((font, index) => {
			return {
				...font,
				origin: 3,
			}
		})
		if (action.data.inlineFonts) {
			try {
				const inlines = action.data.fonts.map(font => call(getEncodedFile, font.originalLocation))
				const files = yield all(inlines)
				fontsInfo = fontsInfo.map((font, index) => {
					return {
						...font,
						fPath: files[index],
					}
				})
			} catch (err) {
				const message = err && err.message
					? 'Could not encode a bundled font: ' + err.message
					: 'Could not encode a bundled font.'
				yield call(imageProcessingFailed, message, action.data.render_generation)
				return
			}
		}
		yield call(setFonts, fontsInfo, action.data.render_generation)
	}
}

function *saveFonts() {
	try{
		let fontsInfo = yield select(setFontsSelector)
		const generation = yield select(state => state.render.renderGeneration)
		yield call(setFonts, fontsInfo, generation)
		fontsInfo.forEach(font => {
			saveFontsFromLocalStorage(font);
		})
	} catch(err) {

	}
}

function *storeFontData() {
	while(true) {
		let action = yield take([actions.RENDER_UPDATE_FONT_ORIGIN, actions.RENDER_UPDATE_INPUT])
		try{
			let fonts = yield select(renderFontSelector)
			let fontData
			let i = 0, len = fonts.length
			while(i<len) {
				if(fonts[i].fName === action.item.fName){
					fontData = fonts[i]
					break
				}
				i += 1
			}
			saveFontsFromLocalStorage(fontData)
		}catch(err) {
			console.log('err:', err)
		}
	}
}

function *processImage(action) {
	try{
		let response = yield call(imageProcessor, action.data)
		imageProcessed(response, action.data)
	} catch (err) {
		yield call(imageProcessingFailed, err && err.message ? err.message : 'Image processing failed.', action.data.render_generation)
	}
}

function *processExpression(action) {
	try {
		const expressionData = yield call(expressionProcessor, action.data.text);
		yield call(expressionProcessed, action.data.id, expressionData, action.data.render_generation);
	} catch (err) {
		yield call(expressionProcessed, action.data.id, {hasFailed: true}, action.data.render_generation);
	}
}

export default [
  takeEvery(actions.RENDER_FONTS, handleRenderFonts),
  takeEvery(actions.RENDER_SET_FONTS, saveFonts),
  takeEvery(actions.RENDER_PROCESS_IMAGE, processImage),
  takeEvery(actions.RENDER_PROCESS_EXPRESSION, processExpression),
  fork(storeFontData)
]
