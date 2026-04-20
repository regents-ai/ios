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
          sceneStyle: {
            backgroundColor: COLORS.DARK_BG,
          },
          tabBarActiveTintColor: COLORS.BLUE,
          tabBarInactiveTintColor: COLORS.TEXT_SECONDARY,
          tabBarLabelStyle: {
            fontFamily: FONTS.body,
            fontSize: 11,
            marginTop: 2,
          },
          tabBarItemStyle: {
            paddingTop: 8,
            paddingBottom: 2,
          },
          tabBarStyle: {
            backgroundColor: COLORS.CARD_ALT,
            borderTopColor: COLORS.BORDER,
            borderTopWidth: 1,
            borderRadius: 24,
            marginHorizontal: 14,
            marginBottom: 10,
            height: 82,
            paddingBottom: 10,
            paddingTop: 8,
            position: 'absolute',
            shadowColor: COLORS.BLUE,
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.08,
            shadowRadius: 20,
            elevation: 8,
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
