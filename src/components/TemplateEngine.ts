import type { SelectedTemplate } from './TemplateGallery';

export interface PresentationTheme {
  name: string;
  style: string;
  bg: string;
  primary: string;
  secondary: string;
  accent: string;
  surface: string;
  text: string;
  muted: string;
  line: string;
  gradient: string;
  dark: boolean;
}

export function getPresentationTheme(template: SelectedTemplate | null): PresentationTheme {
  const name = template?.templateName ?? 'Aurora Gradient';
  const colors = template?.colors ?? ['#2563EB', '#7C3AED', '#A855F7'];
  const style = template?.style ?? 'modern';

  switch (name) {
    case 'Ocean Glass':
      return {
        name,
        style,
        bg: '#E0F7FF',
        primary: colors[0] ?? '#0EA5E9',
        secondary: colors[1] ?? '#67E8F9',
        accent: '#0284C7',
        surface: 'rgba(255,255,255,0.56)',
        text: '#083344',
        muted: '#0E7490',
        line: 'rgba(14,165,233,0.28)',
        gradient: `radial-gradient(circle at 78% 18%, ${colors[1] ?? '#67E8F9'}88, transparent 30%), linear-gradient(135deg, #F0FDFF 0%, ${colors[2] ?? '#E0F2FE'} 46%, ${colors[0] ?? '#0EA5E9'} 100%)`,
        dark: false,
      };
    case 'Neon Future':
      return {
        name,
        style,
        bg: '#020617',
        primary: '#22D3EE',
        secondary: '#A855F7',
        accent: '#F472B6',
        surface: 'rgba(15,23,42,0.78)',
        text: '#F8FAFC',
        muted: '#A5B4FC',
        line: 'rgba(34,211,238,0.32)',
        gradient: 'radial-gradient(circle at 18% 18%, rgba(34,211,238,0.36), transparent 27%), radial-gradient(circle at 82% 76%, rgba(244,114,182,0.34), transparent 30%), linear-gradient(135deg, #020617 0%, #111827 52%, #312E81 100%)',
        dark: true,
      };
    case 'Minimal White':
      return {
        name,
        style,
        bg: '#FFFFFF',
        primary: '#2563EB',
        secondary: '#E2E8F0',
        accent: '#0F172A',
        surface: '#F8FAFC',
        text: '#0F172A',
        muted: '#64748B',
        line: '#CBD5E1',
        gradient: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
        dark: false,
      };
    case 'Business Pro':
      return {
        name,
        style,
        bg: '#0F172A',
        primary: '#1D4ED8',
        secondary: '#38BDF8',
        accent: '#94A3B8',
        surface: 'rgba(15,23,42,0.72)',
        text: '#F8FAFC',
        muted: '#CBD5E1',
        line: 'rgba(148,163,184,0.32)',
        gradient: 'linear-gradient(135deg, #0F172A 0%, #172554 54%, #1E3A8A 100%)',
        dark: true,
      };
    case 'Creative Wave':
      return {
        name,
        style,
        bg: '#F8FAFC',
        primary: '#8B5CF6',
        secondary: '#06B6D4',
        accent: '#F97316',
        surface: 'rgba(255,255,255,0.78)',
        text: '#111827',
        muted: '#475569',
        line: 'rgba(139,92,246,0.22)',
        gradient: 'radial-gradient(circle at 12% 80%, rgba(249,115,22,0.26), transparent 30%), radial-gradient(circle at 84% 18%, rgba(6,182,212,0.28), transparent 32%), linear-gradient(135deg, #FFFFFF 0%, #F5F3FF 100%)',
        dark: false,
      };
    case 'Academic Clean':
      return {
        name,
        style,
        bg: '#F8FAFC',
        primary: '#16A34A',
        secondary: '#E2E8F0',
        accent: '#475569',
        surface: '#FFFFFF',
        text: '#1E293B',
        muted: '#64748B',
        line: '#D9E2EC',
        gradient: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 58%, #ECFDF5 100%)',
        dark: false,
      };
    case 'Sunset Gradient':
      return {
        name,
        style,
        bg: '#F97316',
        primary: '#F97316',
        secondary: '#EC4899',
        accent: '#7C3AED',
        surface: 'rgba(255,255,255,0.18)',
        text: '#FFFFFF',
        muted: 'rgba(255,255,255,0.78)',
        line: 'rgba(255,255,255,0.28)',
        gradient: 'radial-gradient(circle at 78% 18%, rgba(124,58,237,0.45), transparent 30%), linear-gradient(135deg, #F97316 0%, #EC4899 50%, #7C3AED 100%)',
        dark: true,
      };
    case 'Aurora Gradient':
    default:
      return {
        name,
        style,
        bg: '#2563EB',
        primary: colors[0] ?? '#2563EB',
        secondary: colors[1] ?? '#7C3AED',
        accent: colors[2] ?? '#A855F7',
        surface: 'rgba(255,255,255,0.16)',
        text: '#FFFFFF',
        muted: 'rgba(255,255,255,0.78)',
        line: 'rgba(255,255,255,0.26)',
        gradient: `radial-gradient(circle at 76% 16%, ${colors[2] ?? '#A855F7'}88, transparent 30%), radial-gradient(circle at 12% 86%, ${colors[1] ?? '#7C3AED'}77, transparent 34%), linear-gradient(135deg, ${colors[0] ?? '#2563EB'} 0%, ${colors[1] ?? '#7C3AED'} 100%)`,
        dark: true,
      };
  }
}
