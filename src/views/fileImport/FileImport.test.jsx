import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FileImport } from './FileImport'
import fileImportSelector from '../../redux/selectors/file_import_selector'

vi.mock('../../components/header/Import_header', () => ({
  default: () => <div data-testid="import-header" />,
}))

vi.mock('../../helpers/CompositionsProvider', () => ({
  openInBrowser: vi.fn(),
}))

describe('FileImport', () => {
  it('renders processing progress from the importer reducer state alone', () => {
    const importerState = {
      messages: [],
      pendingCommands: 21,
      state: 'processing',
    }
    const viewProps = fileImportSelector({ importer: importerState })

    expect(viewProps).toEqual(importerState)
    expect(() => render(
      <FileImport
        {...viewProps}
        goToComps={vi.fn()}
        importLeave={vi.fn()}
        importLottieFile={vi.fn()}
        importLottieFileFromUrl={vi.fn()}
        lottieProcessCancel={vi.fn()}
      />,
    )).not.toThrow()
    expect(screen.getByText('Pending Commands: 21')).not.toBeNull()
    expect(screen.getByText('Estimated remaining time: 2 seconds')).not.toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
  })
})
