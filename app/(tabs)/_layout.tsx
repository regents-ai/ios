import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { View } from 'react-native';

import { COLORS } from '../../constants/Colors';
import { FONTS } from '../../constants/Typography';

export default function TabLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.DARK_BG }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarHideOnKeyboard: true,
          sceneStyle: {
            backgroundColor: COLORS.DARK_BG,
          },
          tabBarActiveTintColor: COLORS.BLUE,
          tabBarInactiveTintColor: COLORS.TEXT_SECONDARY,
          tabBarLabelStyle: {
            fontFamily: FONTS.body,
            fontSize: 10,
            marginTop: 1,
          },
          tabBarItemStyle: {
            paddingTop: 7,
            paddingBottom: 4,
          },
          tabBarStyle: {
            backgroundColor: COLORS.WHITE,
            borderTopColor: COLORS.BORDER,
            borderTopWidth: 1,
            borderRadius: 28,
            marginHorizontal: 16,
            marginBottom: 14,
            height: 78,
            paddingBottom: 8,
            paddingTop: 8,
            position: 'absolute',
            shadowColor: COLORS.BLACK,
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
            title: 'Wallet',
            tabBarIcon: ({ color, size }) => <Ionicons name="wallet-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="agents"
          options={{
            title: 'Regents',
            tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="terminal"
          options={{
            title: 'Talk',
            tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles-outline" size={size} color={color} />,
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
            title: 'Buy',
            tabBarIcon: ({ color, size }) => <Ionicons name="swap-horizontal-outline" size={size} color={color} />,
          }}
        />
      </Tabs>
    </View>
  );
}
