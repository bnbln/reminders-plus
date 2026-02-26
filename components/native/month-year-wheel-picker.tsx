import React, { useCallback, useRef } from "react";
import {
  FlatList,
  NativeSyntheticEvent,
  StyleProp,
  Text,
  View,
  ViewStyle
} from "react-native";

type MonthYearWheelPickerChangeEvent = NativeSyntheticEvent<{
  monthValue: number;
  yearValue: number;
}>;

export type MonthYearWheelPickerProps = {
  monthLabels: string[];
  monthValues: number[];
  years: number[];
  selectedMonthValue: number;
  selectedYearValue: number;
  onChange?: (event: MonthYearWheelPickerChangeEvent) => void;
  style?: StyleProp<ViewStyle>;
};

const ITEM_HEIGHT = 44;

function WheelColumn<T>({
  data,
  selectedValue,
  onSelect,
  labelKey,
  valueKey,
}: {
  data: T[];
  selectedValue: T[keyof T];
  onSelect: (value: T[keyof T]) => void;
  labelKey: keyof T;
  valueKey: keyof T;
}) {
  const listRef = useRef<FlatList<T>>(null);
  const initialIndex = data.findIndex((item) => item[valueKey] === selectedValue);

  React.useEffect(() => {
    if (initialIndex >= 0) {
      listRef.current?.scrollToIndex({ index: initialIndex, animated: false });
    }
  }, []);

  const handleScrollEnd = useCallback(
    (e: any) => {
      const index = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(data.length - 1, index));
      onSelect(data[clamped][valueKey]);
    },
    [data, onSelect, valueKey]
  );

  return (
    <View style={{ flex: 1, height: ITEM_HEIGHT * 5, overflow: "hidden" }}>
      {/* Selection indicator */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: ITEM_HEIGHT * 2,
          left: 4,
          right: 4,
          height: ITEM_HEIGHT,
          borderRadius: 8,
          backgroundColor: "rgba(128,128,128,0.15)",
          zIndex: 1,
        }}
      />
      <FlatList
        ref={listRef}
        data={data}
        keyExtractor={(_, i) => String(i)}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        renderItem={({ item }) => {
          const isSelected = item[valueKey] === selectedValue;
          return (
            <View
              style={{
                height: ITEM_HEIGHT,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontSize: isSelected ? 17 : 15,
                  fontWeight: isSelected ? "600" : "400",
                  opacity: isSelected ? 1 : 0.45,
                }}
              >
                {String(item[labelKey])}
              </Text>
            </View>
          );
        }}
        contentContainerStyle={{
          paddingVertical: ITEM_HEIGHT * 2,
        }}
        onMomentumScrollEnd={handleScrollEnd}
        getItemLayout={(_, index) => ({
          length: ITEM_HEIGHT,
          offset: ITEM_HEIGHT * index,
          index,
        })}
        initialScrollIndex={initialIndex >= 0 ? initialIndex : 0}
      />
    </View>
  );
}

export default function MonthYearWheelPicker(props: MonthYearWheelPickerProps) {
  const {
    monthLabels,
    monthValues,
    years,
    selectedMonthValue,
    selectedYearValue,
    onChange,
    style,
  } = props;

  const selectedMonthRef = useRef(selectedMonthValue);
  const selectedYearRef = useRef(selectedYearValue);

  const monthData = monthValues.map((v, i) => ({
    label: monthLabels[i] ?? String(v),
    value: v,
  }));
  const yearData = years.map((y) => ({ label: String(y), value: y }));

  const fireChange = useCallback((month: number, year: number) => {
    onChange?.({
      nativeEvent: { monthValue: month, yearValue: year },
    } as MonthYearWheelPickerChangeEvent);
  }, [onChange]);

  return (
    <View style={[{ flexDirection: "row", alignItems: "center" }, style]}>
      <WheelColumn
        data={monthData}
        selectedValue={selectedMonthRef.current}
        labelKey="label"
        valueKey="value"
        onSelect={(v) => {
          selectedMonthRef.current = v as number;
          fireChange(v as number, selectedYearRef.current);
        }}
      />
      <WheelColumn
        data={yearData}
        selectedValue={selectedYearRef.current}
        labelKey="label"
        valueKey="value"
        onSelect={(v) => {
          selectedYearRef.current = v as number;
          fireChange(selectedMonthRef.current, v as number);
        }}
      />
    </View>
  );
}
