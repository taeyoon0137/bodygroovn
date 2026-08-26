import React from 'react'
import SettingsListItem from './list/SettingsListItem'
import SettingsCollapsableItem from './collapsable/SettingsCollapsableItem'

class SettingsAssets extends React.PureComponent {


  render() {

    const isUsingOriginalAssets = this.props.settings.original_assets

    return (
    	<SettingsCollapsableItem 
        title={'Assets'}
        description={'Rasterized assets settings (jpg, png)'}
        >
        <SettingsListItem 
          title='Original Asset Names'
          description='Export assets with their original project names'
          toggleItem={this.props.toggleOriginalNames}
          active={this.props.settings ? this.props.settings.original_names : false}  />
        <SettingsListItem 
          title='Use Source names as asset ids'
          description='uses project source names as asset ids'
          toggleItem={this.props.toggleSourceNames}
          active={this.props.settings ? this.props.settings.use_source_names : false}  />
        <SettingsListItem 
          title='Copy Original Assets'
          description='Uses actual project source files (does not work with AI layers)'
          toggleItem={this.props.toggleOriginalAssets}
          active={this.props.settings ? this.props.settings.original_assets : false}  />
        {this.props.canCompressAssets &&
        !isUsingOriginalAssets &&  
        <SettingsListItem 
          title='PNG palette compression'
          description='Palette colors: 0, 32, 64, 128, or 256. Use 0 to preserve PNG pixels.'
          toggleItem={this.props.togglePngCompression}
          needsInput={true} 
          inputValue={this.props.settings ? this.props.settings.png_palette_colors : 0}
          inputValueChange={this.props.paletteColorsChange}
          active={this.props.settings ? this.props.settings.png_palette_colors !== 0 : false}  />
        }
        <SettingsListItem 
          title='Include in json'
          description='Include rasterized images encoded in the json'
          toggleItem={this.props.toggleEncodeImages}
          active={this.props.settings ? this.props.settings.should_encode_images : false}  />
        <SettingsListItem 
          title='Skip images export'
          description='it will fully ignore any type of asset previous assets data (this will be deprecated in a future release since there is not much value to it)'
          toggleItem={this.props.toggleSkipImages}
          active={this.props.settings ? this.props.settings.should_skip_images : false}  />
        <SettingsListItem 
          title='Use image data from previous export'
          description='To accelerate export and prevent replacing assets, use previous data'
          toggleItem={this.props.toggleReuseImages}
          active={this.props.settings ? this.props.settings.should_reuse_images : false}  />
        <SettingsListItem 
          title='Include video and audio assets'
          description='This is not yet supported by players. Only available for experimantal purposes.'
          toggleItem={this.props.toggleIncludeVideo}
          active={this.props.settings ? this.props.settings.should_include_av_assets : false}  />
      </SettingsCollapsableItem>
    	);
  }
}

export default SettingsAssets
