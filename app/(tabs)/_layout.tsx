import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/Colors';
import { FONTS } from '../../constants/Typography';

export default function TabLayout() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.DARK_BG }} edges={['top']}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: COLORS.BLUE,
          tabBarInactiveTintColor: COLORS.TEXT_SECONDARY,
          tabBarLabelStyle: {
            fontFamily: FONTS.body,
            fontSize: 12,
          },
          tabBarItemStyle: {
            paddingTop: 6,
          },
          tabBarStyle: {
            backgroundColor: COLORS.CARD_BG,
            borderTopColor: COLORS.BORDER,
            borderTopWidth: 1,
            height: 78,
            paddingBottom: 10,
            paddingTop: 8,
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
            title: 'Agents',
            tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="terminal"
          options={{
            title: 'Terminal',
            tabBarIcon: ({ color, size }) => <Ionicons name="terminal-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="techtree"
          options={{
            title: 'Techtree',
            tabBarIcon: ({ color, size }) => <Ionicons name="git-branch-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="autolaunch"
          options={{
            title: 'Autolaunch',
            tabBarIcon: ({ color, size }) => <Ionicons name="rocket-outline" size={size} color={color} />,
          }}
        />
      </Tabs>
    </SafeAreaView>
  );
}
