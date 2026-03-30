import { type ReactNode, useCallback, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  type LayoutChangeEvent,
  Platform,
  ScrollView,
  StyleSheet,
  findNodeHandle,
  type StyleProp,
  type TextInput,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_COLORS } from '@/constants/app-config';

const DEFAULT_BOTTOM_PADDING = 160;
const DEFAULT_SCROLL_OFFSET = 120;
const DEFAULT_SCROLL_RESERVE = 280;

type InputRef = React.RefObject<TextInput | null>;

type AuthFormLayoutProps = {
  children: ReactNode;
  scrollViewRef: React.RefObject<ScrollView | null>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  bottomPadding?: number;
};

export function useAuthKeyboardScroll(additionalOffset = DEFAULT_SCROLL_OFFSET) {
  const scrollViewRef = useRef<ScrollView>(null);

  const scrollToInput = useCallback(
    (inputRef: InputRef) => {
      const scrollView = scrollViewRef.current;
      const input = inputRef.current;

      if (!scrollView || !input) {
        return;
      }

      const inputHandle = findNodeHandle(input);
      if (!inputHandle) {
        return;
      }

      requestAnimationFrame(() => {
        scrollView.scrollResponderScrollNativeHandleToKeyboard(
          inputHandle,
          additionalOffset,
          true,
        );
      });
    },
    [additionalOffset],
  );

  return {
    scrollViewRef,
    scrollToInput,
  };
}

export function AuthFormLayout({
  children,
  scrollViewRef,
  contentContainerStyle,
  bottomPadding = DEFAULT_BOTTOM_PADDING,
}: AuthFormLayoutProps) {
  const insets = useSafeAreaInsets();
  const [containerHeight, setContainerHeight] = useState(0);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setContainerHeight(event.nativeEvent.layout.height);
  }, []);

  return (
    <KeyboardAvoidingView
      style={styles.keyboardContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      onLayout={handleLayout}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}>
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={[
          styles.contentContainer,
          contentContainerStyle,
          {
            minHeight:
              containerHeight > 0
                ? containerHeight + DEFAULT_SCROLL_RESERVE + insets.bottom
                : undefined,
            paddingBottom: bottomPadding + insets.bottom,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
    backgroundColor: APP_COLORS.surface,
  },
  scrollView: {
    flex: 1,
    backgroundColor: APP_COLORS.surface,
  },
  contentContainer: {
    flexGrow: 1,
    backgroundColor: APP_COLORS.surface,
  },
});
