import { definePreset } from '@openng/optimus-ui-themes';
import Aura from '@openng/optimus-ui-themes/aura';

/**
 * Aura with the school's deep teal as the primary colour (buttons, focus, selected items),
 * slightly rounder controls, and dark-mode surfaces with a faint teal tint to match the page.
 * The matching page tokens live in src/styles.css; keep the two in step.
 */
export const AppPreset = definePreset(Aura, {
  primitive: {
    borderRadius: { none: '0', xs: '4px', sm: '6px', md: '9px', lg: '12px', xl: '14px' },
    teal: {
      50: '#ecf6f5',
      100: '#d3ebe9',
      200: '#a8d6d2',
      300: '#73bbb6',
      400: '#3f9a97',
      500: '#1f7f80',
      600: '#0e5e61',
      700: '#0a4b4e',
      800: '#0b3d40',
      900: '#0a3134',
      950: '#06201f',
    },
  },
  semantic: {
    primary: {
      50: '{teal.50}',
      100: '{teal.100}',
      200: '{teal.200}',
      300: '{teal.300}',
      400: '{teal.400}',
      500: '{teal.500}',
      600: '{teal.600}',
      700: '{teal.700}',
      800: '{teal.800}',
      900: '{teal.900}',
      950: '{teal.950}',
    },
    colorScheme: {
      light: {
        surface: {
          0: '#ffffff',
          50: '#f6f8f9',
          100: '#edf0f2',
          200: '#e2e7eb',
          300: '#cfd7dd',
          400: '#a3adb5',
          500: '#7d8a94',
          600: '#5c6a75',
          700: '#3a4853',
          800: '#26333c',
          900: '#15222b',
          950: '#0c1316',
        },
        primary: {
          color: '{teal.600}',
          contrastColor: '#ffffff',
          hoverColor: '{teal.700}',
          activeColor: '{teal.800}',
        },
        highlight: {
          background: '{teal.50}',
          focusBackground: '{teal.100}',
          color: '{teal.700}',
          focusColor: '{teal.800}',
        },
      },
      dark: {
        surface: {
          0: '#ffffff',
          50: '#e5ecef',
          100: '#c0cbd1',
          200: '#93a2ab',
          300: '#6f808a',
          400: '#52626b',
          500: '#3d4c54',
          600: '#2f414a',
          700: '#223138',
          800: '#182328',
          900: '#131c20',
          950: '#0c1316',
        },
        primary: {
          color: '#5cc2ba',
          contrastColor: '#06201f',
          hoverColor: '#7fd0c9',
          activeColor: '#a3dfda',
        },
        highlight: {
          background: 'rgba(92, 194, 186, .16)',
          focusBackground: 'rgba(92, 194, 186, .24)',
          color: 'rgba(255, 255, 255, .87)',
          focusColor: 'rgba(255, 255, 255, .87)',
        },
      },
    },
  },
});
