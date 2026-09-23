/**
 * "Fund your personal agent's wallet in seconds" hero.
 *
 * Headline, the agents Regents works with, and three rows of gradient crowns
 * sliding in a seamless loop. Each row renders its crowns twice and slides by
 * exactly one set's width on the UI thread, so the loop never shows a seam.
 * Rows stand still when Reduce Motion is on.
 */

import { useEffect, useMemo } from 'react';
import { Image, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/components/motion/useReducedMotion';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

type Agent = {
  name: string;
  logo: ImageSourcePropType;
  /** Mark-only logos sit centred on a tile of this color; app icons fill the tile. */
  tileColor?: string;
};

const AGENTS: Agent[] = [
  { name: 'Muse', logo: require('@/assets/images/agents/muse.png') },
  { name: 'Hermes', logo: require('@/assets/images/agents/hermes.png'), tileColor: '#000000' },
  { name: 'Grok Bot', logo: require('@/assets/images/agents/grok-bot.png') },
  { name: 'Claude', logo: require('@/assets/images/agents/claude.png') },
  { name: 'Codex', logo: require('@/assets/images/agents/codex.png') },
];

const WORKS_WITH_LABEL = 'Works with Muse, Hermes, Grok Bot, Claude and Codex';

const CROWNS: ImageSourcePropType[] = [
  require('@/assets/images/crowns/crown-01-mesh-ember.png'),
  require('@/assets/images/crowns/crown-02-mesh-aurora.png'),
  require('@/assets/images/crowns/crown-03-mesh-royal.png'),
  require('@/assets/images/crowns/crown-04-mesh-gold.png'),
  require('@/assets/images/crowns/crown-05-warp-magma.png'),
  require('@/assets/images/crowns/crown-06-warp-ocean.png'),
  require('@/assets/images/crowns/crown-07-warp-candy.png'),
  require('@/assets/images/crowns/crown-09-simplex-jade.png'),
  require('@/assets/images/crowns/crown-10-staticmesh-orchid.png'),
  require('@/assets/images/crowns/crown-15-perlin-nebula.png'),
  require('@/assets/images/crowns/crown-17-smoke-teal.png'),
  require('@/assets/images/crowns/crown-18-smoke-rose.png'),
  require('@/assets/images/crowns/crown-20-voronoi-stained.png'),
  require('@/assets/images/crowns/crown-21-warp-toxic.png'),
  require('@/assets/images/crowns/crown-23-panels-prism.png'),
  require('@/assets/images/crowns/crown-25-mesh-ice.png'),
];

/** Each row: its own shuffle of the 16 crowns, a direction, and a loop time. */
const CROWN_ROWS = [
  { order: [0, 5, 11, 2, 14, 7, 9, 3, 12, 1, 15, 6, 10, 4, 13, 8], reverse: false, durationMs: 42000 },
  { order: [7, 13, 1, 10, 4, 15, 0, 8, 3, 11, 6, 14, 2, 9, 5, 12], reverse: true, durationMs: 36000 },
  { order: [12, 2, 8, 15, 6, 0, 13, 4, 10, 1, 7, 3, 14, 5, 11, 9], reverse: false, durationMs: 48000 },
] as const;

const TILE_SIZE = 52;
const MARK_SIZE = 34;
const CROWN_SIZE = 48;
const CROWN_GAP = 8;
/** Width of one full set of crowns; the row slides exactly this far per loop. */
const LOOP_WIDTH = CROWNS.length * (CROWN_SIZE + CROWN_GAP);

export function AgentFundHero() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const reducedMotion = useReducedMotion();

  return (
    <View style={styles.hero}>
      <Text accessibilityRole="header" style={styles.headline}>
        Fund your personal agent’s wallet in seconds
      </Text>

      <View accessible accessibilityLabel={WORKS_WITH_LABEL} style={styles.agents}>
        {AGENTS.map((agent) => (
          <View key={agent.name} style={styles.agent}>
            {agent.tileColor ? (
              <View style={[styles.tile, styles.markTile, { backgroundColor: agent.tileColor }]}>
                <Image source={agent.logo} resizeMode="contain" style={styles.mark} />
              </View>
            ) : (
              <Image source={agent.logo} style={styles.tile} />
            )}
            <Text numberOfLines={1} style={styles.agentName}>
              {agent.name}
            </Text>
          </View>
        ))}
      </View>

      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={styles.crownRows}
      >
        {CROWN_ROWS.map((row, index) => (
          <CrownRow
            key={index}
            order={row.order}
            reverse={row.reverse}
            durationMs={row.durationMs}
            still={reducedMotion}
          />
        ))}
      </View>
    </View>
  );
}

function CrownRow({
  order,
  reverse,
  durationMs,
  still,
}: {
  order: readonly number[];
  reverse: boolean;
  durationMs: number;
  still: boolean;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(progress);
    progress.value = 0;
    if (still) {
      return;
    }

    progress.value = withRepeat(withTiming(1, { duration: durationMs, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(progress);
  }, [durationMs, progress, still]);

  const slide = useAnimatedStyle(() => ({
    transform: [{ translateX: (reverse ? progress.value - 1 : -progress.value) * LOOP_WIDTH }],
  }));

  return (
    <View style={rowStyles.window}>
      <Animated.View style={[rowStyles.track, slide]}>
        {[...order, ...order].map((crown, index) => (
          <Image key={index} source={CROWNS[crown]} style={rowStyles.crown} />
        ))}
      </Animated.View>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  window: {
    height: CROWN_SIZE,
    overflow: 'hidden',
  },
  track: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    gap: CROWN_GAP,
  },
  crown: {
    width: CROWN_SIZE,
    height: CROWN_SIZE,
  },
});

function makeStyles({ colors, fonts, type, space }: Theme) {
  return StyleSheet.create({
    hero: {
      gap: space.s4,
    },
    headline: {
      color: colors.text,
      fontSize: type.title.size,
      lineHeight: type.title.line,
      textAlign: 'center',
      fontFamily: fonts.title,
      paddingHorizontal: space.s4,
    },
    agents: {
      flexDirection: 'row',
      justifyContent: 'center',
      paddingHorizontal: space.s4,
    },
    agent: {
      width: 72,
      alignItems: 'center',
      gap: 6,
    },
    tile: {
      width: TILE_SIZE,
      height: TILE_SIZE,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairline,
      overflow: 'hidden',
    },
    markTile: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    mark: {
      width: MARK_SIZE,
      height: MARK_SIZE,
    },
    agentName: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 16,
      fontFamily: fonts.ui,
    },
    crownRows: {
      gap: CROWN_GAP,
    },
  });
}
