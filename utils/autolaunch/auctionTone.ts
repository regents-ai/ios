import type { ThemeColors } from '@/theme/tokens';
import type { AuctionStatusTone } from '@/utils/autolaunch/auctionDisplay';
import type { Tone } from '@/utils/statusTone';

/** The theme's accent and wash for an auction status pill. */
export function auctionStatusTone(tone: AuctionStatusTone, colors: ThemeColors): Tone {
  switch (tone) {
    case 'success':
      return { accent: colors.success, wash: colors.successWash };
    case 'error':
      return { accent: colors.error, wash: colors.errorWash };
    case 'info':
      return { accent: colors.info, wash: colors.accentWash };
  }
}
