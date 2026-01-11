import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Constants from 'expo-constants';
import { Tabs } from 'expo-router';
import { Icon, Label, NativeTabs, VectorIcon } from 'expo-router/unstable-native-tabs';
import React from 'react';
import { DynamicColorIOS, Platform, StyleSheet, View } from 'react-native';

import { GlassSurface, withAlpha } from '@/components/ui/glass-surface';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme ?? 'light';

  if (__DEV__ && Platform.OS === 'ios' && Number(Platform.Version) >= 26) {
    if (Constants.appOwnership === 'expo') {
      console.warn(
        '[NativeTabs] Running in Expo Go. Some iOS 26 behaviors may not match docs unless using a custom native build compiled with Xcode 26+.'
      );
    }
  }

  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return (
      <View style={{ flex: 1 }}>
        <Tabs
          screenOptions={{
            tabBarActiveTintColor: Colors[theme].tint,
            headerShown: false,
            tabBarStyle: {
              backgroundColor: 'transparent',
              borderTopWidth: 0,
            },
            tabBarBackground: () => (
              <GlassSurface
                style={StyleSheet.absoluteFill}
                glassEffectStyle="regular"
                tintColor={withAlpha(Colors[theme].background, theme === 'dark' ? 0.22 : 0.35)}
                fallbackBackgroundColor={Colors[theme].background}
              />
            ),
          }}>
          <Tabs.Screen
            name="home"
            options={{
              title: 'Home',
              tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
            }}
          />
          <Tabs.Screen
            name="search"
            options={{
              title: 'Hinzufügen',
              tabBarIcon: ({ color }) => <MaterialIcons name="add" size={28} color={color} />,
            }}
          />
          <Tabs.Screen
            name="explore"
            options={{
              title: 'Explore',
              tabBarIcon: ({ color }) => <IconSymbol size={28} name="paperplane.fill" color={color} />,
            }}
          />
        </Tabs>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <NativeTabs
        minimizeBehavior="onScrollDown"
        // Docs: can fix scroll edge detection issues which can also break scroll-based behaviors
        disableTransparentOnScrollEdge
        labelStyle={
          Platform.OS === 'ios'
            ? {
                color: DynamicColorIOS({
                  dark: 'white',
                  light: 'black',
                }),
              }
            : undefined
        }
        tintColor={
          Platform.OS === 'ios'
            ? DynamicColorIOS({
                dark: 'white',
                light: 'black',
              })
            : Colors[theme].tint
        }>
        <NativeTabs.Trigger name="home">
          <Label>Home</Label>
          {Platform.select({
            ios: <Icon sf={{ default: 'house', selected: 'house.fill' }} />,
            android: <Icon src={<VectorIcon family={MaterialIcons} name="home" />} />,
          })}
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="search" role="search">
          <Label>Hinzufügen</Label>
          {Platform.select({
            ios: <Icon sf={{ default: 'plus', selected: 'plus' }} />,
            android: <Icon src={<VectorIcon family={MaterialIcons} name="add" />} />,
          })}
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="explore">
          <Label>Explore</Label>
          {Platform.select({
            ios: <Icon sf={{ default: 'paperplane', selected: 'paperplane.fill' }} />,
            android: <Icon src={<VectorIcon family={MaterialIcons} name="explore" />} />,
          })}
        </NativeTabs.Trigger>

      </NativeTabs>
    </View>
  );
}
