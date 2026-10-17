Pod::Spec.new do |s|
  s.name           = 'AssistLLM'
  s.version        = '1.0.0'
  s.summary        = 'Apple Foundation Models bridge for Assist.'
  s.description    = 'Long-lived LanguageModelSession with JS-backed tools, guided generation and availability reasons.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # Foundation Models only exists on iOS 26+, the app still deploys to 16.4.
  s.weak_frameworks = 'FoundationModels'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
end
