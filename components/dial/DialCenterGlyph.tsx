import Ionicons from '@expo/vector-icons/Ionicons';

type DialCenterGlyphProps = {
  color: string;
  expanded: boolean;
};

export function DialCenterGlyph({ color, expanded }: DialCenterGlyphProps) {
  return (
    <Ionicons
      name={expanded ? 'close' : 'sparkles-outline'}
      size={24}
      color={color}
    />
  );
}
