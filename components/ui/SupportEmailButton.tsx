/**
 * SupportEmailButton - Opens native email client with pre-populated support info
 *
 * Used when users encounter failed transactions to easily contact support.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../../constants/Colors';
import { RegentPressable } from './RegentPressable';
import { runRegentHaptic } from './haptics';
import {
  GuestCheckoutDebugInfo,
  openSupportEmail,
  SUPPORT_EMAIL,
  TransactionDebugInfo
} from '../../utils/supportEmail';

const { BLUE, BORDER, WHITE } = COLORS;

interface SupportEmailButtonProps {
  debugInfo: TransactionDebugInfo | GuestCheckoutDebugInfo;
  variant?: 'primary' | 'secondary' | 'link';
  size?: 'small' | 'medium' | 'large';
  label?: string;
}

export function SupportEmailButton({
  debugInfo,
  variant = 'primary',
  size = 'medium',
  label = 'Contact Support'
}: SupportEmailButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handlePress = async () => {
    setIsLoading(true);
    try {
      const success = await openSupportEmail(debugInfo);
      if (!success) {
        runRegentHaptic('warning');
        Alert.alert(
          'Email is not available',
          `Please email ${SUPPORT_EMAIL} directly and include your transaction details.`,
          [{ text: 'OK' }]
        );
      } else {
        runRegentHaptic('success');
      }
    } catch (error) {
      console.error('Failed to open support email:', error);
      runRegentHaptic('warning');
      Alert.alert(
        'Email is not available',
        'Please try again in a moment.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsLoading(false);
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case 'small':
        return { paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, iconSize: 16 };
      case 'large':
        return { paddingHorizontal: 24, paddingVertical: 16, fontSize: 18, iconSize: 22 };
      default:
        return { paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, iconSize: 18 };
    }
  };

  const sizeStyles = getSizeStyles();

  if (variant === 'link') {
    return (
      <RegentPressable
        onPress={handlePress}
        disabled={isLoading}
        pressStyle="none"
        style={isLoading && styles.disabled}
      >
        <Text style={[styles.linkText, { fontSize: sizeStyles.fontSize }]}>
          {isLoading ? 'Opening…' : SUPPORT_EMAIL}
        </Text>
      </RegentPressable>
    );
  }

  return (
    <RegentPressable
      onPress={handlePress}
      disabled={isLoading}
      style={[
        styles.button,
        variant === 'secondary' && styles.buttonSecondary,
        {
          paddingHorizontal: sizeStyles.paddingHorizontal,
          paddingVertical: sizeStyles.paddingVertical,
        },
        isLoading && styles.disabled,
      ]}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={variant === 'secondary' ? BLUE : WHITE} />
      ) : (
        <View style={styles.buttonContent}>
          <Ionicons
            name="mail-outline"
            size={sizeStyles.iconSize}
            color={variant === 'secondary' ? BLUE : WHITE}
          />
          <Text
            style={[
              styles.buttonText,
              variant === 'secondary' && styles.buttonTextSecondary,
              { fontSize: sizeStyles.fontSize },
            ]}
          >
            {label}
          </Text>
        </View>
      )}
    </RegentPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: BLUE,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: BORDER,
  },
  disabled: {
    opacity: 0.7,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buttonText: {
    color: WHITE,
    fontWeight: '600',
  },
  buttonTextSecondary: {
    color: BLUE,
  },
  linkText: {
    color: BLUE,
    textDecorationLine: 'underline',
    fontWeight: '500',
  },
});
