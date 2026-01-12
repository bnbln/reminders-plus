
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { SFSymbol } from '@/components/ui/sfsymbol';
import { Colors } from '@/constants/theme';
import { useTasksStore } from '@/context/tasks-store';
import { useColorScheme } from '@/hooks/use-color-scheme';

const ICON_PRESETS = [
    'folder.fill',
    'list.bullet',
    'star.fill',
    'heart.fill',
    'flag.fill',
    'tag.fill',
    'doc.text.fill',
    'paintbrush.fill',
    'briefcase.fill',
    'person.2.fill',
    'cart.fill',
    'creditcard.fill',
    'gift.fill',
    'gamecontroller.fill',
    'headphones',
    'airplane',
    'tram.fill',
    'leaf.fill',
    'flame.fill',
    'bolt.fill',
];

const COLOR_PRESETS = [
    '#7C3AED', '#2563EB', '#F97316', '#10B981',
    '#EF4444', '#F59E0B', '#EC4899', '#6366F1'
];

export default function ProjectEditScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const theme = useColorScheme() ?? 'light';
    const isDark = theme === 'dark';
    const styles = React.useMemo(() => createStyles(theme), [theme]);

    const { projects, setProjects, tasks, setTasks } = useTasksStore();
    const project = React.useMemo(() => projects.find((p) => p.id === id), [projects, id]);

    // Local state
    const [name, setName] = React.useState(project?.name ?? '');
    const [icon, setIcon] = React.useState(project?.icon ?? 'folder.fill');
    const [color, setColor] = React.useState(project?.color ?? '#808080');
    const [description, setDescription] = React.useState(project?.description ?? '');

    React.useEffect(() => {
        if (project) {
            setName(project.name);
            setIcon(project.icon);
            setColor(project.color);
            setDescription(project.description ?? '');
        }
    }, [project]);

    const onSave = React.useCallback(() => {
        if (!project) return;
        setProjects(prev => prev.map(p =>
            p.id === id ? { ...p, name, icon, color, description } : p
        ));
        router.back();
    }, [id, name, icon, color, description, project, setProjects, router]);

    const onDelete = React.useCallback(() => {
        setProjects(prev => prev.map(p =>
            p.id === id ? { ...p, deletedAt: Date.now() } : p
        ));
        setTasks(prev => prev.map(t =>
            t.projectId === id && !t.deletedAt ? { ...t, deletedAt: Date.now() } : t
        ));
        router.dismissAll();
        router.navigate('/(tabs)/explore');
    }, [id, setProjects, setTasks, router]);

    if (!project) return null;

    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 70 : 0}
        >
            <ScrollView style={styles.container} contentContainerStyle={styles.content}>
                <Stack.Screen
                    options={{
                        headerRight: () => (
                            <Pressable onPress={onSave} disabled={!name.trim()}>
                                <Text style={[styles.saveButton, !name.trim() && styles.disabledButton]}>Fertig</Text>
                            </Pressable>
                        ),
                    }}
                />

                <View style={styles.formGroup}>
                    <View style={styles.iconPreview}>
                        <SFSymbol name={icon} size={28} color={color} />
                    </View>
                    <TextInput
                        style={styles.nameInput}
                        value={name}
                        onChangeText={setName}
                        placeholder="Projektname"
                        placeholderTextColor={Colors[theme].text + '40'}
                        autoFocus
                    />
                </View>

                {/* Description Field */}
                <View style={styles.formGroup}>
                    <TextInput
                        style={[styles.nameInput, { fontSize: 15, height: 60 }]}
                        value={description}
                        onChangeText={setDescription}
                        placeholder="Beschreibung (optional)"
                        placeholderTextColor={Colors[theme].text + '40'}
                        multiline
                    />
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Icon</Text>
                    <View style={styles.grid}>
                        {ICON_PRESETS.map(c => (
                            <Pressable
                                key={c}
                                onPress={() => setIcon(c)}
                                style={[
                                    styles.swatch,
                                    icon === c && styles.selectedSwatch
                                ]}
                            >
                                <SFSymbol name={c} size={24} color={icon === c ? Colors[theme].tint : Colors[theme].text} />
                            </Pressable>
                        ))}
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Farbe</Text>
                    <View style={styles.grid}>
                        {COLOR_PRESETS.map(c => (
                            <Pressable
                                key={c}
                                onPress={() => setColor(c)}
                                style={[
                                    styles.colorSwatch,
                                    { backgroundColor: c },
                                    color === c && styles.selectedSwatch
                                ]}
                            />
                        ))}
                    </View>
                </View>

                <Pressable onPress={onDelete} style={styles.deleteButton}>
                    <MaterialIcons name="delete-outline" size={20} color="#FF3B30" />
                    <Text style={styles.deleteText}>Projekt löschen</Text>
                </Pressable>

            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const createStyles = (theme: 'light' | 'dark') =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: theme === 'dark' ? '#1C1C1E' : '#F2F2F7',
        },
        content: {
            padding: 16,
            paddingBottom: 40,
        },
        formGroup: {
            backgroundColor: theme === 'dark' ? '#2C2C2E' : '#FFFFFF',
            borderRadius: 12,
            padding: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            marginBottom: 24,
        },
        iconPreview: {
            width: 44,
            height: 44,
            backgroundColor: theme === 'dark' ? '#3A3A3C' : '#F2F2F7',
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
        },
        nameInput: {
            flex: 1,
            fontSize: 17,
            fontWeight: '600',
            color: Colors[theme].text,
        },
        section: {
            marginBottom: 24,
        },
        sectionTitle: {
            fontSize: 13,
            fontWeight: '600',
            color: theme === 'dark' ? '#8E8E93' : '#6E6E73',
            marginBottom: 8,
            marginLeft: 8,
            textTransform: 'uppercase',
        },
        grid: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 12,
            padding: 12,
            backgroundColor: theme === 'dark' ? '#2C2C2E' : '#FFFFFF',
            borderRadius: 12,
        },
        swatch: {
            width: 44,
            height: 44,
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme === 'dark' ? '#3A3A3C' : '#F2F2F7',
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
        saveButton: {
            fontSize: 17,
            fontWeight: '600',
            color: Colors[theme].tint,
        },
        disabledButton: {
            opacity: 0.3,
        },
        deleteButton: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            gap: 8,
            backgroundColor: theme === 'dark' ? '#2C2C2E' : '#FFFFFF',
            borderRadius: 12,
            marginBottom: 20,
        },
        deleteText: {
            fontSize: 17,
            color: '#FF3B30',
            fontWeight: '500',
        }
    });
