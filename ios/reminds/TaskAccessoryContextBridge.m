#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(TaskAccessoryContextBridge, NSObject)

RCT_EXTERN_METHOD(setContext:(NSString *)mode
                  projectId:(NSString * _Nullable)projectId
                  projectLabel:(NSString * _Nullable)projectLabel
                  selectedDateStart:(NSNumber * _Nullable)selectedDateStart)

@end

@interface RCT_EXTERN_MODULE(CloudSyncBridge, RCTEventEmitter)

RCT_EXTERN_METHOD(getStatus:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(setEnabled:(nonnull NSNumber *)enabled
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(syncNow:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
