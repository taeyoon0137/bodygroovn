import { createSelector } from 'reselect'

const getItems = (state) => {
	return state.compositions.items
}

const getCurrentComp = (state) => {
	return state.compositions.current
}

const settingsReportsSelector = createSelector(
  [getItems, getCurrentComp ],
  (items, current) => {

  	const exportModes = items[current].settings.export_modes

  	return {
  		_isActive: exportModes.reports,
  	}
  }
)

export default settingsReportsSelector
