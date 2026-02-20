import React from "react";
import {
  Platform,
  requireNativeComponent,
  type NativeSyntheticEvent,
  type StyleProp,
  View,
  type ViewStyle,
} from "react-native";

type MonthYearWheelPickerChangeEvent = NativeSyntheticEvent<{
  monthValue: number;
  yearValue: number;
}>;

type NativeMonthYearWheelPickerProps = {
  monthLabels: string[];
  monthValues: number[];
  years: number[];
  selectedMonthValue: number;
  selectedYearValue: number;
  onChange?: (event: MonthYearWheelPickerChangeEvent) => void;
  style?: StyleProp<ViewStyle>;
};

const NativeMonthYearWheelPicker =
  Platform.OS === "ios"
    ? requireNativeComponent<NativeMonthYearWheelPickerProps>("MonthYearWheelPicker")
    : null;

export type MonthYearWheelPickerProps = NativeMonthYearWheelPickerProps;

export default function MonthYearWheelPicker(props: MonthYearWheelPickerProps) {
  if (Platform.OS !== "ios" || !NativeMonthYearWheelPicker) {
    return <View style={props.style} />;
  }
  return <NativeMonthYearWheelPicker {...props} />;
}

