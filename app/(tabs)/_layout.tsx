import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

export default function TabLayout() {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarHideOnKeyboard: true,
          sceneStyle: {
            backgroundColor: colors.bg,
          },
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarLabelStyle: {
            fontFamily: fonts.ui,
            fontSize: 10,
            marginTop: 1,
          },
          tabBarItemStyle: {
            paddingTop: 7,
            paddingBottom: 4,
          },
          tabBarStyle: {
            backgroundColor: colors.surfaceElevated,
            borderTopColor: colors.hairlineStrong,
            borderTopWidth: 1,
            borderRadius: 28,
            marginHorizontal: 16,
            marginBottom: 14,
            height: 78,
            paddingBottom: 8,
            paddingTop: 8,
            position: 'absolute',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.08,
            shadowRadius: 18,
            elevation: 6,
          },
        }}
      >
        <Tabs.Screen name="index" options={{ href: null }} />
        <Tabs.Screen
          name="wallet"
          options={{
            title: 'Fund',
            tabBarIcon: ({ color, size }) => <Ionicons name="wallet-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="send"
          options={{
            title: 'Pay',
            tabBarIcon: ({ color, size }) => <Ionicons name="card-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="earn"
          options={{
            title: 'Earn',
            tabBarIcon: ({ color, size }) => <Ionicons name="sparkles-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="message"
          options={{
            title: 'Message',
            tabBarIcon: ({ color, size }) => <Ionicons name="chatbubble-ellipses-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="agents"
          options={{
            href: null,
            title: 'Agents',
            tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="techtree"
          options={{
            href: null,
            title: 'Guide',
            tabBarIcon: ({ color, size }) => <Ionicons name="git-branch-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="autolaunch"
          options={{
            href: null,
            title: 'Buy',
            tabBarIcon: ({ color, size }) => <Ionicons name="swap-horizontal-outline" size={size} color={color} />,
          }}
        />
      </Tabs>
    </View>
  );
}
