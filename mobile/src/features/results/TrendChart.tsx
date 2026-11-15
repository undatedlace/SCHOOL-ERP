import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { formatDay } from '@/lib/dates';
import { fontFamily, useTheme } from '@/theme';
import { chartPoints, trendDescription, type TrendPoint } from './resultsLogic';

const HEIGHT = 176;
const PAD = { left: 34, right: 14, top: 22, bottom: 26 };
const TICKS = [0, 50, 100];

interface TrendChartProps {
  points: readonly TrendPoint[];
}

/**
 * The percentage of each scored test, oldest to newest, as a line with a dot and a written
 * value on every point. The picture is hidden from screen readers; the wrapper reads the same
 * numbers out as one sentence instead.
 */
export function TrendChart({ points }: TrendChartProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.floor(e.nativeEvent.layout.width));
  const placed = width > 0 ? chartPoints(points, width, HEIGHT, PAD) : [];
  const yOf = (percent: number) => PAD.top + (HEIGHT - PAD.top - PAD.bottom) * (1 - percent / 100);
  const showValues = points.length <= 8;
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <View onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={trendDescription(points)} testID="trend-chart">
      {width > 0 ? (
        <Svg width={width} height={HEIGHT} importantForAccessibility="no-hide-descendants">
          {TICKS.map((t) => (
            <Line key={t} x1={PAD.left} x2={width - PAD.right} y1={yOf(t)} y2={yOf(t)} stroke={colors.border} strokeWidth={1} strokeDasharray={t === 0 ? undefined : '4 4'} />
          ))}
          {TICKS.map((t) => (
            <SvgText key={`l${t}`} x={PAD.left - 6} y={yOf(t) + 4} fontSize={11} fill={colors.mutedForeground} textAnchor="end" fontFamily={fontFamily.body}>
              {`${t}%`}
            </SvgText>
          ))}
          {placed.length > 1 ? (
            <Polyline
              points={placed.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={colors.primary}
              strokeWidth={3}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}
          {placed.map((p) => (
            <Circle key={p.id} cx={p.x} cy={p.y} r={5} fill={colors.card} stroke={colors.primary} strokeWidth={3} />
          ))}
          {showValues
            ? placed.map((p) => (
                <SvgText
                  key={`v${p.id}`}
                  x={p.x}
                  y={p.y - 11}
                  fontSize={11}
                  fill={colors.foreground}
                  textAnchor="middle"
                  fontFamily={fontFamily.bodySemi}
                >
                  {`${Math.round(p.percent)}%`}
                </SvgText>
              ))
            : null}
          {first ? (
            <SvgText x={placed[0]?.x ?? PAD.left} y={HEIGHT - 6} fontSize={11} fill={colors.mutedForeground} textAnchor={placed.length > 1 ? 'start' : 'middle'} fontFamily={fontFamily.body}>
              {formatDay(first.date, 'dayMonth')}
            </SvgText>
          ) : null}
          {last && placed.length > 1 ? (
            <SvgText x={placed[placed.length - 1]!.x} y={HEIGHT - 6} fontSize={11} fill={colors.mutedForeground} textAnchor="end" fontFamily={fontFamily.body}>
              {formatDay(last.date, 'dayMonth')}
            </SvgText>
          ) : null}
        </Svg>
      ) : (
        <View style={{ height: HEIGHT }} />
      )}
    </View>
  );
}
