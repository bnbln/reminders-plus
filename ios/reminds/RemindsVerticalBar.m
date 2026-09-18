#import <React/RCTEventEmitter.h>
#import <UIKit/UIKit.h>

// Report the window's layout trait, not a device model or a screen-width heuristic.
@interface RemindsVerticalBar : RCTEventEmitter
@property (nonatomic, weak) UIWindow *observedWindow;
@property (nonatomic, strong) id traitRegistration;
@property (nonatomic) BOOL listening;
@end

@implementation RemindsVerticalBar
RCT_EXPORT_MODULE()

+ (BOOL)requiresMainQueueSetup { return YES; }
- (dispatch_queue_t)methodQueue { return dispatch_get_main_queue(); }
- (NSArray<NSString *> *)supportedEvents { return @[@"verticalBarLayoutChanged"]; }

- (UIWindow *)activeWindow
{
  for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
    if (![scene isKindOfClass:UIWindowScene.class]) continue;
    for (UIWindow *window in ((UIWindowScene *)scene).windows) {
      if (window.isKeyWindow) return window;
    }
  }
  return nil;
}

- (NSDictionary *)layoutState
{
  BOOL hasVerticalBar = NO;
  if (@available(iOS 27.1, *)) {
    hasVerticalBar = self.activeWindow.traitCollection.verticalBarEdge != UIVerticalBarEdgeUnspecified;
  }
  return @{@"hasVerticalBar": @(hasVerticalBar)};
}

- (NSDictionary *)constantsToExport { return self.layoutState; }

- (void)observeWindow
{
  if (@available(iOS 27.1, *)) {
    UIWindow *window = self.activeWindow;
    if (self.observedWindow != window || !self.traitRegistration) {
      if (self.traitRegistration) [self.observedWindow unregisterForTraitChanges:self.traitRegistration];
      self.observedWindow = window;
      __weak RemindsVerticalBar *weakSelf = self;
      self.traitRegistration = [window registerForTraitChanges:UITraitCollection.systemTraitsAffectingVerticalBarEdge
        withHandler:^(__kindof id<UITraitEnvironment> environment, UITraitCollection *previousTraits) {
          RemindsVerticalBar *module = weakSelf;
          if (module.listening) [module sendEventWithName:@"verticalBarLayoutChanged" body:module.layoutState];
        }];
    }
  }
  if (self.listening) [self sendEventWithName:@"verticalBarLayoutChanged" body:self.layoutState];
}

- (void)startObserving
{
  self.listening = YES;
  [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(observeWindow)
    name:UISceneDidActivateNotification object:nil];
  [self observeWindow];
}

- (void)stopObserving
{
  self.listening = NO;
  [NSNotificationCenter.defaultCenter removeObserver:self];
  if (@available(iOS 27.1, *)) {
    if (self.traitRegistration) [self.observedWindow unregisterForTraitChanges:self.traitRegistration];
    self.traitRegistration = nil;
    self.observedWindow = nil;
  }
}

- (void)invalidate
{
  [self stopObserving];
  [super invalidate];
}
@end
