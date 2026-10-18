#import <React/RCTEventEmitter.h>
#import <UIKit/UIKit.h>

// Report the window's layout traits, not a device model or a screen-width heuristic.
@interface RemindsVerticalBar : RCTEventEmitter
@property (nonatomic, weak) UIWindow *observedWindow;
@property (nonatomic, strong) id traitRegistration;
@property (nonatomic, strong) id hingeInteraction;
@property (nonatomic, copy) NSDictionary *reportedFold;
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
  UITraitCollection *traits = self.activeWindow.traitCollection ?: UITraitCollection.currentTraitCollection;
  BOOL hasVerticalBar = NO;
  if (@available(iOS 27.1, *)) {
    hasVerticalBar = traits.verticalBarEdge != UIVerticalBarEdgeUnspecified;
  }
  // iPhone Duo: compact on the outer display, regular on the inner one.
  BOOL isRegularWidth = traits.horizontalSizeClass == UIUserInterfaceSizeClassRegular;
  NSMutableDictionary *state = [@{@"hasVerticalBar": @(hasVerticalBar), @"isRegularWidth": @(isRegularWidth)} mutableCopy];
  // iPhone Duo fold: a division region that is active only while the device is
  // bent (book mode). Fully opened flat it is inactive and not returned here.
  if (@available(iOS 27.1, *)) {
    UIWindow *window = self.activeWindow;
    UIViewReservedRegion *fold = [window reservedRegionsOfKind:UIViewReservedRegionKind.divisionRegionKind].firstObject;
    if (fold) {
      CGRect frame = fold.frame;
      state[@"fold"] = @{@"x": @(frame.origin.x), @"y": @(frame.origin.y),
                         @"width": @(frame.size.width), @"height": @(frame.size.height)};
    }
  }
  return state;
}

- (void)sendLayoutState
{
  if (!self.listening) return;
  NSDictionary *state = self.layoutState;
  self.reportedFold = state[@"fold"];
  [self sendEventWithName:@"verticalBarLayoutChanged" body:state];
}

// The hinge reports every angle step while bending; JS only needs the fold.
- (void)sendLayoutStateIfFoldChanged
{
  NSDictionary *fold = self.layoutState[@"fold"];
  if (fold == self.reportedFold || [fold isEqualToDictionary:self.reportedFold]) return;
  [self sendLayoutState];
}

- (NSDictionary *)constantsToExport
{
  BOOL supportsVerticalBar = NO;
  if (@available(iOS 27.1, *)) supportsVerticalBar = YES;
  NSMutableDictionary *constants = [self.layoutState mutableCopy];
  constants[@"supportsVerticalBar"] = @(supportsVerticalBar);
  return constants;
}

- (void)observeWindow
{
  if (@available(iOS 17.0, *)) {
    UIWindow *window = self.activeWindow;
    if (self.observedWindow != window || !self.traitRegistration) {
      if (self.traitRegistration) [self.observedWindow unregisterForTraitChanges:self.traitRegistration];
      [self removeHingeInteraction];
      self.observedWindow = window;
      __weak RemindsVerticalBar *weakSelf = self;
      NSArray<UITrait> *traits = @[UITraitHorizontalSizeClass.class];
      if (@available(iOS 27.1, *)) {
        traits = [traits arrayByAddingObjectsFromArray:UITraitCollection.systemTraitsAffectingVerticalBarEdge];
      }
      self.traitRegistration = [window registerForTraitChanges:traits
        withHandler:^(__kindof id<UITraitEnvironment> environment, UITraitCollection *previousTraits) {
          [weakSelf sendLayoutState];
        }];
      if (@available(iOS 27.1, *)) {
        // Bending or flattening the Duo changes no trait, only the hinge. The
        // fold region follows it, so report again on the next run loop pass.
        UIHingeInteraction *interaction = [[UIHingeInteraction alloc]
          initWithUpdateHandler:^(UIHingeInteraction *hinge, UIHingeInteractionUpdate *update) {
            [weakSelf sendLayoutStateIfFoldChanged];
            dispatch_async(dispatch_get_main_queue(), ^{ [weakSelf sendLayoutStateIfFoldChanged]; });
          }];
        [window addInteraction:interaction];
        self.hingeInteraction = interaction;
      }
    }
  }
  [self sendLayoutState];
}

- (void)removeHingeInteraction
{
  if (@available(iOS 27.1, *)) {
    if (self.hingeInteraction) [self.observedWindow removeInteraction:self.hingeInteraction];
  }
  self.hingeInteraction = nil;
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
  if (@available(iOS 17.0, *)) {
    if (self.traitRegistration) [self.observedWindow unregisterForTraitChanges:self.traitRegistration];
    self.traitRegistration = nil;
    [self removeHingeInteraction];
    self.observedWindow = nil;
  }
}

- (void)invalidate
{
  [self stopObserving];
  [super invalidate];
}
@end
