import React from 'react'
import { StyleSheet, css } from 'aphrodite'
import { getProductVersion } from '../../helpers/version'

const styles = StyleSheet.create({
  wrapper: {
    height: '10px',
    position: 'absolute',
    bottom:'4px',
    right:'0',
    overflow: 'hidden',
    'font-size': '10px',
    padding: '0 10px',
    color: '#aaa'
  }
})

function Footer() {
  return (
    <div className={css(styles.wrapper)}>
      {'Version: ' + getProductVersion()}
    </div>
  )
}

export default Footer
