#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(TaskAccessoryContextBridge, NSObject)

RCT_EXTERN_METHOD(setContext:(NSString *)mode
                  projectId:(NSString * _Nullable)projectId
                  projectLabel:(NSString * _Nullable)projectLabel)

@end
