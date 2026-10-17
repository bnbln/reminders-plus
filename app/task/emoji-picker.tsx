import { usePageDimensions } from "@/components/navigation/vertical-bar-safe-area";
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSheetHeaderActions } from '@/components/navigation/sheet-header-actions';
import { withAlpha } from '@/components/ui/glass-surface';
import { Colors, contrastAlpha, PICKER_SHEET_DARK_ROW, PICKER_SHEET_DARK_ROW_BORDER } from '@/constants/theme';
import { useTasksStore } from '@/context/tasks-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { t } from '@/i18n';
import { ripple } from "@/components/ui/ripple";
import { m3InputProps } from '@/components/ui/m3-input';
import {
    filterTaskStyleEmojiOptions,
    TASK_STYLE_COLOR_SWATCHES,
} from '@/utils/task-style-emoji';
import { useThemedStyles } from "@/hooks/use-themed-styles";

export default function EmojiPickerScreen() {
    const router = useRouter();
    const { taskId } = useLocalSearchParams<{ taskId: string }>();
    const { width: windowWidth } = usePageDimensions();
    const theme = useColorScheme() ?? 'light';
    const isDark = theme === 'dark';
    const styles = useThemedStyles(() => createStyles(theme), [theme]);
    const insets = useSafeAreaInsets();

    const { tasks, setTasks } = useTasksStore();
    const task = React.useMemo(() => tasks.find((t) => t.id === taskId), [tasks, taskId]);
    const selectedEmoji = task?.emoji ?? '✅';
    const selectedColor = task?.color;
    const [query, setQuery] = React.useState('');
    const visibleEmojiOptions = React.useMemo(
        () => filterTaskStyleEmojiOptions(query),
        [query]
    );
    const { emojiColumns, emojiTileSize } = React.useMemo(() => {
        const horizontalPadding = 32;
        const gridGap = 12;
        const minTileSize = 56;
        const availableWidth = Math.max(0, windowWidth - horizontalPadding);
        const computedColumns = Math.floor((availableWidth + gridGap) / (minTileSize + gridGap));
        // Even column counts keep a vertical fold (iPhone Duo) between tiles.
        const columns = Math.max(4, computedColumns - (computedColumns % 2));

        return {
            emojiColumns: columns,
            emojiTileSize: Math.floor((availableWidth - gridGap * (columns - 1)) / columns),
        };
    }, [windowWidth]);

    const applyStyleAndClose = React.useCallback((nextEmoji: string, nextColor: string | undefined) => {
        if (!taskId) {
            router.back();
            return;
        }

        setTasks((prev) => prev.map((t) => (t.id === taskId ? {
            ...t,
            emoji: nextEmoji,
            color: nextColor,
        } : t)));
        router.back();
    }, [router, setTasks, taskId]);

    const handleCancel = React.useCallback(() => {
        router.back();
    }, [router]);
    const sheetHeaderActions = useSheetHeaderActions({ onClose: handleCancel });

    return (
        <View style={styles.container}>
            <Stack.Screen
                options={{
                    title: t('emojiPicker.title'),
                    ...sheetHeaderActions,
                    headerShown: true,
                    headerStyle: {
                        backgroundColor: isDark ? '#000000' : '#F2F2F7',
                    },
                    headerShadowVisible: false,
                } as any}
            />

            <View style={styles.sheet}>
                <FlatList
                    key={`emoji-grid-${emojiColumns}`}
                    data={visibleEmojiOptions}
                    numColumns={emojiColumns}
                    keyExtractor={(item) => item.emoji}
                    renderItem={({ item }) => (
                        <Pressable
                          android_ripple={ripple()}
                            onPress={() => applyStyleAndClose(item.emoji, selectedColor)}
                            accessibilityLabel={`${item.emoji} ${item.label}`}
                            style={[
                                styles.emojiSwatch,
                                { width: emojiTileSize, height: emojiTileSize },
                                item.emoji === selectedEmoji && styles.selectedSwatch
                            ]}
                        >
                            <Text style={styles.emojiText}>{item.emoji}</Text>
                        </Pressable>
                    )}
                    style={styles.content}
                    contentInsetAdjustmentBehavior="automatic"
                    contentContainerStyle={[
                        styles.contentContainer,
                        { paddingBottom: insets.bottom + 100 },
                    ]}
                    ListHeaderComponentStyle={styles.listHeader}
                    ListHeaderComponent={(
                        <View>
                            <Text style={styles.sectionTitle}>{t('emojiPicker.color')}</Text>
                            <View style={styles.colorGrid}>
                                {TASK_STYLE_COLOR_SWATCHES.map((color) => (
                                    <Pressable
                                      android_ripple={ripple()}
                                        key={color}
                                        onPress={() => applyStyleAndClose(selectedEmoji, color)}
                                        style={[
                                            styles.colorSwatch,
                                            { backgroundColor: color },
                                            selectedColor === color && styles.selectedSwatch
                                        ]}
                                    />
                                ))}
                            </View>

                            {selectedColor && (
                                <Pressable
                                  android_ripple={ripple()}
                                    onPress={() => applyStyleAndClose(selectedEmoji, undefined)}
                                    style={styles.resetButton}
                                >
                                    <Text style={styles.resetText}>{t('emojiPicker.resetColor')}</Text>
                                </Pressable>
                            )}

                            <Text style={[styles.sectionTitle, styles.emojiSectionTitle]}>{t('emojiPicker.emoji')}</Text>
                            <View style={styles.searchShell}>
                                <TextInput
                                  {...m3InputProps()}
                                    value={query}
                                    onChangeText={setQuery}
                                    placeholder={t('emojiPicker.searchPlaceholder')}
                                    placeholderTextColor={withAlpha(textColorForTheme(theme), 0.42)}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    clearButtonMode="while-editing"
                                    style={styles.searchInput}
                                />
                            </View>
                        </View>
                    )}
                    ListEmptyComponent={(
                        <Text style={styles.emptyState}>{t('emojiPicker.empty')}</Text>
                    )}
                    columnWrapperStyle={styles.emojiRow}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                />
            </View>
        </View>
    );
}

function textColorForTheme(theme: keyof typeof Colors) {
    return Colors[theme].text;
}

const createStyles = (theme: keyof typeof Colors) => {
    const isDark = theme === 'dark';
    const text = textColorForTheme(theme);

    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: isDark ? '#000000' : '#F2F2F7',
        },
        sheet: {
            flex: 1,
            backgroundColor: isDark ? '#000000' : '#F2F2F7',
        },
        content: {
            flex: 1,
            backgroundColor: isDark ? '#000000' : '#F2F2F7',
        },
        contentContainer: {
            paddingTop: 16,
            paddingHorizontal: 16,
        },
        listHeader: {
            marginBottom: 14,
        },
        sectionTitle: {
            fontSize: 13,
            fontWeight: '600',
            color: isDark ? '#8E8E93' : '#6E6E73',
            marginBottom: 12,
            marginLeft: 4,
            textTransform: 'uppercase',
        },
        emojiSectionTitle: {
            marginTop: 28,
        },
        searchShell: {
            minHeight: 46,
            borderRadius: 14,
            borderWidth: isDark ? 1 : StyleSheet.hairlineWidth,
            borderColor: isDark ? PICKER_SHEET_DARK_ROW_BORDER : withAlpha(text, contrastAlpha(0.1)),
            backgroundColor: isDark ? PICKER_SHEET_DARK_ROW : withAlpha(text, contrastAlpha(0.04)),
            paddingHorizontal: 14,
            justifyContent: 'center',
            marginBottom: 14,
        },
        searchInput: {
            fontSize: 16,
            color: text,
            paddingVertical: 0,
        },
        colorGrid: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 12,
        },
        emojiRow: {
            gap: 12,
            marginBottom: 12,
        },
        emojiSwatch: {
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isDark ? PICKER_SHEET_DARK_ROW : withAlpha(text, contrastAlpha(0.04)),
        },
        emojiText: {
            fontSize: 28,
        },
        colorSwatch: {
            width: 44,
            height: 44,
            borderRadius: 22,
        },
        selectedSwatch: {
            borderWidth: 2,
            borderColor: Colors[theme].tint,
        },
        resetButton: {
            marginTop: 24,
            alignItems: 'center',
            padding: 8,
        },
        resetText: {
            fontSize: 15,
            color: withAlpha(text, contrastAlpha(0.6)),
        },
        emptyState: {
            marginTop: 18,
            fontSize: 14,
            color: withAlpha(text, contrastAlpha(0.58)),
            textAlign: 'center',
        },
    });
};
