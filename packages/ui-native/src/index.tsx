import * as React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  View,
  useColorScheme,
  type PressableProps,
  type ScrollViewProps,
  type StyleProp,
  type TextInputProps as NativeTextInputProps,
  type TextProps as NativeTextProps,
  type TextStyle,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { createTenantBrand } from "@school-sis/design-tokens";
import {
  nativeThemes,
  nativeTokens,
  type NativeTheme,
  type NativeThemeName,
} from "@school-sis/design-tokens/native";

const ThemeContext = React.createContext<NativeTheme>(nativeThemes.light);

export interface ScholarMindThemeProviderProps {
  children: React.ReactNode;
  primaryAccent?: string;
  theme?: NativeThemeName;
}

export function ScholarMindThemeProvider({ children, primaryAccent, theme }: ScholarMindThemeProviderProps) {
  const systemTheme = useColorScheme();
  const themeName: NativeThemeName = theme ?? (systemTheme === "dark" ? "dark" : "light");
  const tenantBrand = createTenantBrand(primaryAccent ?? "");
  const resolvedTheme: NativeTheme = tenantBrand
    ? { ...nativeThemes[themeName], primary: tenantBrand.hex, primaryHover: tenantBrand.hoverHex }
    : nativeThemes[themeName];
  return <ThemeContext.Provider value={resolvedTheme}>{children}</ThemeContext.Provider>;
}

export function useScholarMindTheme(): NativeTheme {
  return React.useContext(ThemeContext);
}

export interface ScreenProps extends ViewProps {
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  edges?: Edge[];
  scroll?: boolean;
  scrollViewProps?: Omit<ScrollViewProps, "children" | "contentContainerStyle">;
}

export function Screen({
  children,
  contentContainerStyle,
  edges = ["top", "right", "bottom", "left"],
  scroll = false,
  scrollViewProps,
  style,
  ...props
}: ScreenProps) {
  const theme = useScholarMindTheme();
  const content = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.screenContent, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
      {...scrollViewProps}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.screenContent, contentContainerStyle]}>{children}</View>
  );

  return (
    <SafeAreaView
      edges={edges}
      style={[styles.screen, { backgroundColor: theme.background }, style]}
      {...props}
    >
      {content}
    </SafeAreaView>
  );
}

export type TextVariant = "body" | "caption" | "label" | "title" | "heading" | "mono";

export interface TextProps extends NativeTextProps {
  tone?: "default" | "muted" | "danger";
  variant?: TextVariant;
}

export const Text = React.forwardRef<NativeText, TextProps>(
  ({ style, tone = "default", variant = "body", ...props }, ref) => {
    const theme = useScholarMindTheme();
    const color = tone === "muted"
      ? theme.mutedForeground
      : tone === "danger"
        ? theme.danger
        : theme.foreground;

    return (
      <NativeText
        ref={ref}
        {...props}
        allowFontScaling
        maxFontSizeMultiplier={2}
        style={[styles.text, textVariants[variant], { color }, style]}
      />
    );
  },
);
Text.displayName = "Text";

export type ButtonVariant = "primary" | "secondary" | "destructive" | "outline" | "ghost";

export interface ButtonProps extends Omit<PressableProps, "children" | "style"> {
  children: React.ReactNode;
  endIcon?: React.ReactNode;
  startIcon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: ButtonVariant;
}

export const Button = React.forwardRef<View, ButtonProps>(
  ({ accessibilityState, children, disabled, endIcon, startIcon, style, variant = "primary", ...props }, ref) => {
    const theme = useScholarMindTheme();
    const palette = buttonPalette(theme, variant);

    return (
      <Pressable
        ref={ref}
        {...props}
        accessibilityRole="button"
        accessibilityState={{ ...accessibilityState, disabled: Boolean(disabled) }}
        disabled={disabled}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: palette.backgroundColor,
            borderColor: palette.borderColor,
            opacity: disabled ? 0.5 : pressed ? 0.82 : 1,
          },
          style,
        ]}
      >
        {startIcon ? <View accessible={false}>{startIcon}</View> : null}
        <Text variant="label" style={{ color: palette.color }}>{children}</Text>
        {endIcon ? <View accessible={false}>{endIcon}</View> : null}
      </Pressable>
    );
  },
);
Button.displayName = "Button";

export interface IconButtonProps extends Omit<PressableProps, "children" | "style"> {
  children: React.ReactNode;
  label: string;
  style?: StyleProp<ViewStyle>;
  variant?: ButtonVariant;
}

export const IconButton = React.forwardRef<View, IconButtonProps>(
  ({ accessibilityState, children, disabled, label, style, variant = "ghost", ...props }, ref) => {
    const theme = useScholarMindTheme();
    const palette = buttonPalette(theme, variant);
    return (
      <Pressable
        ref={ref}
        {...props}
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ ...accessibilityState, disabled: Boolean(disabled) }}
        disabled={disabled}
        hitSlop={4}
        style={({ pressed }) => [
          styles.iconButton,
          {
            backgroundColor: palette.backgroundColor,
            borderColor: palette.borderColor,
            opacity: disabled ? 0.5 : pressed ? 0.82 : 1,
          },
          style,
        ]}
      >
        <View accessible={false}>{children}</View>
      </Pressable>
    );
  },
);
IconButton.displayName = "IconButton";

export const Card = React.forwardRef<View, ViewProps>(({ style, ...props }, ref) => {
  const theme = useScholarMindTheme();
  return (
    <View
      ref={ref}
      style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }, style]}
      {...props}
    />
  );
});
Card.displayName = "Card";

export interface TextInputProps extends NativeTextInputProps {
  invalid?: boolean;
}

export const TextInput = React.forwardRef<NativeTextInput, TextInputProps>(
  ({ accessibilityState, invalid = false, placeholderTextColor, style, ...props }, ref) => {
    const theme = useScholarMindTheme();
    return (
      <NativeTextInput
        ref={ref}
        {...props}
        allowFontScaling
        accessibilityState={{ ...accessibilityState, disabled: props.editable === false }}
        aria-invalid={invalid}
        placeholderTextColor={placeholderTextColor ?? theme.mutedForeground}
        selectionColor={theme.focus}
        style={[
          styles.input,
          {
            backgroundColor: theme.background,
            borderColor: invalid ? theme.danger : theme.input,
            color: theme.foreground,
          },
          style,
        ]}
      />
    );
  },
);
TextInput.displayName = "TextInput";

export const Textarea = React.forwardRef<NativeTextInput, TextInputProps>(
  ({ numberOfLines = 4, style, ...props }, ref) => (
    <TextInput
      ref={ref}
      {...props}
      multiline
      numberOfLines={numberOfLines}
      style={[styles.textarea, style]}
      textAlignVertical="top"
    />
  ),
);
Textarea.displayName = "Textarea";

type FieldControlProps = NativeTextInputProps & { invalid?: boolean };

export interface FormFieldProps extends ViewProps {
  children: React.ReactElement<FieldControlProps>;
  description?: string;
  error?: string;
  label: string;
  required?: boolean;
}

export function FormField({
  children,
  description,
  error,
  label,
  required = false,
  style,
  ...props
}: FormFieldProps) {
  return (
    <View style={[styles.field, style]} {...props}>
      <Text variant="label">
        {label}{required ? " *" : ""}
      </Text>
      {React.cloneElement(children, {
        accessibilityLabel: children.props.accessibilityLabel ?? label,
        accessibilityHint: children.props.accessibilityHint ?? description,
        invalid: Boolean(error),
      })}
      {description ? <Text variant="caption" tone="muted">{description}</Text> : null}
      {error ? <Text accessibilityRole="alert" variant="caption" tone="danger">{error}</Text> : null}
    </View>
  );
}

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export interface StatusBadgeProps extends ViewProps {
  children: React.ReactNode;
  tone?: StatusTone;
}

export function StatusBadge({ children, style, tone = "neutral", ...props }: StatusBadgeProps) {
  const theme = useScholarMindTheme();
  const palette = statusPalette(theme, tone);
  return (
    <View
      {...props}
      accessibilityRole="text"
      style={[styles.badge, { backgroundColor: palette.backgroundColor }, style]}
    >
      <Text variant="caption" style={[styles.badgeText, { color: palette.color }]}>{children}</Text>
    </View>
  );
}

export const Badge = StatusBadge;

export interface AlertProps extends ViewProps {
  children?: React.ReactNode;
  title: string;
  tone?: Exclude<StatusTone, "neutral">;
}

export function Alert({ children, style, title, tone = "info", ...props }: AlertProps) {
  const theme = useScholarMindTheme();
  const palette = statusPalette(theme, tone);
  return (
    <View
      {...props}
      accessibilityLiveRegion={tone === "danger" ? "assertive" : "polite"}
      accessibilityRole={tone === "danger" ? "alert" : undefined}
      style={[styles.alert, { backgroundColor: palette.mutedColor, borderColor: palette.backgroundColor }, style]}
    >
      <Text variant="label">{title}</Text>
      {children ? <Text tone="muted">{children}</Text> : null}
    </View>
  );
}

export interface StatePanelProps extends ViewProps {
  action?: React.ReactNode;
  description?: string;
  kind?: "empty" | "error" | "loading" | "unavailable";
  title: string;
}

export function StatePanel({
  action,
  description,
  kind = "empty",
  style,
  title,
  ...props
}: StatePanelProps) {
  const theme = useScholarMindTheme();
  const isError = kind === "error";
  return (
    <View
      {...props}
      accessible
      accessibilityLiveRegion={isError ? "assertive" : "polite"}
      accessibilityRole={isError ? "alert" : undefined}
      style={[
        styles.state,
        {
          backgroundColor: isError ? theme.dangerMuted : theme.card,
          borderColor: isError ? theme.danger : theme.border,
        },
        style,
      ]}
    >
      {kind === "loading" ? <ActivityIndicator accessibilityElementsHidden color={theme.primary} /> : null}
      <Text variant="heading">{title}</Text>
      {description ? <Text tone="muted" style={styles.stateDescription}>{description}</Text> : null}
      {action ? <View style={styles.stateAction}>{action}</View> : null}
    </View>
  );
}

export function EmptyState(props: Omit<StatePanelProps, "kind">) {
  return <StatePanel kind="empty" {...props} />;
}

export function ErrorState(props: Omit<StatePanelProps, "kind">) {
  return <StatePanel kind="error" {...props} />;
}

export function LoadingState(props: Omit<StatePanelProps, "kind">) {
  return <StatePanel kind="loading" {...props} />;
}

export function UnavailableState(props: Omit<StatePanelProps, "kind">) {
  return <StatePanel kind="unavailable" {...props} />;
}

function buttonPalette(theme: NativeTheme, variant: ButtonVariant) {
  switch (variant) {
    case "secondary":
      return { backgroundColor: theme.secondary, borderColor: theme.secondary, color: theme.secondaryForeground };
    case "destructive":
      return { backgroundColor: theme.danger, borderColor: theme.danger, color: theme.dangerForeground };
    case "outline":
      return { backgroundColor: "transparent", borderColor: theme.input, color: theme.foreground };
    case "ghost":
      return { backgroundColor: "transparent", borderColor: "transparent", color: theme.foreground };
    default:
      return { backgroundColor: theme.primary, borderColor: theme.primary, color: theme.primaryForeground };
  }
}

function statusPalette(theme: NativeTheme, tone: StatusTone) {
  switch (tone) {
    case "info":
      return { backgroundColor: theme.info, color: theme.infoForeground, mutedColor: theme.infoMuted };
    case "success":
      return { backgroundColor: theme.success, color: theme.successForeground, mutedColor: theme.successMuted };
    case "warning":
      return { backgroundColor: theme.warning, color: theme.warningForeground, mutedColor: theme.warningMuted };
    case "danger":
      return { backgroundColor: theme.danger, color: theme.dangerForeground, mutedColor: theme.dangerMuted };
    default:
      return { backgroundColor: theme.secondary, color: theme.secondaryForeground, mutedColor: theme.muted };
  }
}

const textVariants = StyleSheet.create<Record<TextVariant, TextStyle>>({
  body: { fontFamily: nativeTokens.fontFamily.sans, fontSize: nativeTokens.fontSize.md, lineHeight: 24 },
  caption: { fontFamily: nativeTokens.fontFamily.sans, fontSize: nativeTokens.fontSize.sm, lineHeight: 20 },
  label: { fontFamily: nativeTokens.fontFamily.sans, fontSize: nativeTokens.fontSize.sm, fontWeight: "600", lineHeight: 20 },
  title: { fontFamily: nativeTokens.fontFamily.sans, fontSize: nativeTokens.fontSize["3xl"], fontWeight: "700", lineHeight: 38 },
  heading: { fontFamily: nativeTokens.fontFamily.sans, fontSize: nativeTokens.fontSize.lg, fontWeight: "600", lineHeight: 26 },
  mono: { fontFamily: nativeTokens.fontFamily.mono, fontSize: nativeTokens.fontSize.sm, lineHeight: 20 },
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
  screenContent: { flexGrow: 1, padding: nativeTokens.space[4] },
  text: { fontFamily: nativeTokens.fontFamily.sans },
  button: {
    alignItems: "center",
    borderRadius: nativeTokens.radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: nativeTokens.space[2],
    justifyContent: "center",
    minHeight: nativeTokens.density.touchTarget,
    paddingHorizontal: nativeTokens.space[4],
    paddingVertical: nativeTokens.space[2],
  },
  iconButton: {
    alignItems: "center",
    borderRadius: nativeTokens.radius.md,
    borderWidth: 1,
    height: nativeTokens.density.touchTarget,
    justifyContent: "center",
    width: nativeTokens.density.touchTarget,
  },
  card: {
    borderRadius: nativeTokens.radius.lg,
    borderWidth: 1,
    elevation: 2,
    padding: nativeTokens.space[4],
    shadowColor: nativeTokens.color.slate950,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  input: {
    borderRadius: nativeTokens.radius.md,
    borderWidth: 1,
    fontFamily: nativeTokens.fontFamily.sans,
    fontSize: nativeTokens.fontSize.md,
    minHeight: nativeTokens.density.touchTarget,
    paddingHorizontal: nativeTokens.space[3],
    paddingVertical: nativeTokens.space[2],
  },
  textarea: { minHeight: 112 },
  field: { gap: nativeTokens.space[2] },
  badge: {
    alignSelf: "flex-start",
    borderRadius: nativeTokens.radius.full,
    paddingHorizontal: nativeTokens.space[3],
    paddingVertical: nativeTokens.space[1],
  },
  badgeText: { fontWeight: "600" },
  alert: {
    borderRadius: nativeTokens.radius.lg,
    borderWidth: 1,
    gap: nativeTokens.space[1],
    padding: nativeTokens.space[4],
  },
  state: {
    alignItems: "center",
    borderRadius: nativeTokens.radius.lg,
    borderStyle: "dashed",
    borderWidth: 1,
    gap: nativeTokens.space[2],
    justifyContent: "center",
    minHeight: 192,
    padding: nativeTokens.space[8],
  },
  stateDescription: { textAlign: "center" },
  stateAction: { marginTop: nativeTokens.space[2] },
});

export { nativeThemes, nativeTokens };
export type { NativeTheme, NativeThemeName };
