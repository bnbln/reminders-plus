import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Tabs } from 'expo-router';
import { Icon, Label, NativeTabs, VectorIcon } from 'expo-router/unstable-native-tabs';
import React from 'react';
import { DynamicColorIOS, Platform, StyleSheet } from 'react-native';

import { GlassSurface, withAlpha } from '@/components/ui/glass-surface';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme ?? 'light';

  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return (
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
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="explore"
          options={{
            title: 'Explore',
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="paperplane.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: 'Search',
            tabBarIcon: ({ color }) => <IconSymbol size={24} name="magnifyingglass" color={color} />,
          }}
        />
      </Tabs>
    );
  }

  return (
    <NativeTabs
      minimizeBehavior="onScrollDown"
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
      <NativeTabs.Trigger name="index">
        <Label>Home</Label>
        {Platform.select({
          ios: <Icon sf={{ default: 'house', selected: 'house.fill' }} />,
          android: <Icon src={<VectorIcon family={MaterialIcons} name="home" />} />,
        })}
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="explore">
        <Label>Explore</Label>
        {Platform.select({
          ios: <Icon sf={{ default: 'paperplane', selected: 'paperplane.fill' }} />,
          android: <Icon src={<VectorIcon family={MaterialIcons} name="explore" />} />,
        })}
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="search" role="search">
        <Label>Add</Label>
        {Platform.select({
          ios: <Icon sf="plus" />,
          android: <Icon src={<VectorIcon family={MaterialIcons} name="add" />} />,
        })}
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
