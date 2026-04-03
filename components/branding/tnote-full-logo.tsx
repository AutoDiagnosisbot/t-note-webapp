import type { SvgProps } from 'react-native-svg';

import FullLogoSvg from '@/assets/images/full.svg';

type TNoteFullLogoProps = SvgProps & {
  width?: number;
  height?: number;
};

export function TNoteFullLogo({
  width = 204,
  height = 78,
  ...props
}: TNoteFullLogoProps) {
  return <FullLogoSvg width={width} height={height} {...props} />;
}
