#import <React/RCTBridgeModule.h>
#import <React/RCTComponent.h>
#import <React/RCTViewManager.h>

@interface RCT_EXTERN_MODULE(TaskAccessoryContextBridge, NSObject)

RCT_EXTERN_METHOD(setContext:(NSString *)mode
                  projectId:(NSString * _Nullable)projectId
                  projectLabel:(NSString * _Nullable)projectLabel)

@end

@interface RCT_EXTERN_MODULE(MonthYearWheelPicker, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(monthLabels, NSArray<NSString *>)
RCT_EXPORT_VIEW_PROPERTY(monthValues, NSArray<NSNumber *>)
RCT_EXPORT_VIEW_PROPERTY(years, NSArray<NSNumber *>)
RCT_EXPORT_VIEW_PROPERTY(selectedMonthValue, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(selectedYearValue, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(onChange, RCTBubblingEventBlock)

@end

@interface RCT_EXTERN_MODULE(MonthYearPickerBridge, NSObject)

RCT_EXTERN_METHOD(present:(NSArray<NSString *> *)monthLabels
                  monthValues:(NSArray<NSNumber *> *)monthValues
                  years:(NSArray<NSNumber *> *)years
                  selectedMonthValue:(nonnull NSNumber *)selectedMonthValue
                  selectedYearValue:(nonnull NSNumber *)selectedYearValue
                  anchorFrame:(NSDictionary * _Nullable)anchorFrame
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
