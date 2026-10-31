# Adds the widget extension, the Siri intents and the in-app WidgetBridge plugin to the Xcode project that `npx cap add ios` generates.
# Run from ios-app/ after the native files have been copied into ios/App (see .github/workflows/ios.yml).
require 'xcodeproj'

project = Xcodeproj::Project.open('ios/App/App.xcodeproj')
app = project.targets.find { |t| t.name == 'App' } or abort('App target not found')
app_group = project.main_group.find_subpath('App', false) or abort('App group not found')

# 1. The bridge plugin, the view controller that registers it, the Siri intents and the app group entitlement.
%w[WidgetBridgePlugin.swift MainViewController.swift GradeData.swift GradeIntents.swift].each do |name|
  app.add_file_references([app_group.new_reference(name)])
end
app_group.new_reference('App.entitlements')
app.build_configurations.each do |c|
  c.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'App/App.entitlements'
  c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0' # App Intents with parameters in Siri phrases
end

# 2. The widget extension target.
widget = project.new_target(:app_extension, 'GPAWAMWidget', :ios, '17.0')
group = project.main_group.new_group('GPAWAMWidget', 'GPAWAMWidget')
widget.add_file_references([group.new_reference('GPAWAMWidget.swift')])
group.new_reference('Info.plist')
group.new_reference('GPAWAMWidget.entitlements')
widget.add_system_framework('WidgetKit')
widget.add_system_framework('SwiftUI')
version = app.build_configurations.first.build_settings
widget.build_configurations.each do |c|
  s = c.build_settings
  s['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.kyosukeamagiri.gpawam.widget'
  s['PRODUCT_NAME'] = '$(TARGET_NAME)'
  s['INFOPLIST_FILE'] = 'GPAWAMWidget/Info.plist'
  s['GENERATE_INFOPLIST_FILE'] = 'NO'
  s['CODE_SIGN_ENTITLEMENTS'] = 'GPAWAMWidget/GPAWAMWidget.entitlements'
  s['SWIFT_VERSION'] = '5.0'
  s['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0'
  s['TARGETED_DEVICE_FAMILY'] = '1,2'
  s['SKIP_INSTALL'] = 'YES'
  s['MARKETING_VERSION'] = version['MARKETING_VERSION'] || '1.0'
  s['CURRENT_PROJECT_VERSION'] = version['CURRENT_PROJECT_VERSION'] || '1'
  s['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks']
  s['ASSETCATALOG_COMPILER_WIDGET_BACKGROUND_COLOR_NAME'] = ''
end

# 3. Build the widget with the app and embed it in the app's PlugIns folder.
app.add_dependency(widget)
embed = app.new_copy_files_build_phase('Embed Foundation Extensions')
embed.dst_subfolder_spec = '13'
embed.add_file_reference(widget.product_reference, true).settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }

project.save
puts "Added #{widget.name} and the WidgetBridge plugin to #{app.name}"
