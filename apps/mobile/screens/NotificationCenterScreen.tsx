import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';

const FALLBACK_NOTIFICATIONS = [
  {
    id: 'n1',
    title: 'Student Checked In',
    message: 'Sarah tapped her ID card at the Main Gate IoT Turnstile.',
    time: 'Today, 8:14 AM',
    type: 'TAP_IN',
    icon: '✅'
  },
  {
    id: 'n2',
    title: 'Tuition Payment Processed',
    message: 'Thank you! Your $5,000 Fall Semester payment was received.',
    time: 'Yesterday, 2:30 PM',
    type: 'FINANCE',
    icon: '💳'
  },
  {
    id: 'n3',
    title: 'Student Checked Out',
    message: 'Sarah tapped her ID card at the Library Exit.',
    time: 'Yesterday, 3:15 PM',
    type: 'TAP_OUT',
    icon: '🏃'
  },
  {
    id: 'n4',
    title: 'Bus Route Alert',
    message: 'Bus #42 is running 10 minutes late due to traffic.',
    time: 'Monday, 7:15 AM',
    type: 'TRANSPORT',
    icon: '🚌'
  }
];

export function NotificationCenterScreen({ navigation }: any) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const res = await fetch('http://10.0.2.2:3000/api/parent/notifications?parentId=00000000-0000-0000-0000-000000000000');
        const data = await res.json();
        if (data.notifications && data.notifications.length > 0) {
          setNotifications(data.notifications);
        } else {
          setNotifications(FALLBACK_NOTIFICATIONS);
        }
      } catch (err) {
        console.warn("Failed to fetch live notifications from server, using fallbacks:", err);
        setNotifications(FALLBACK_NOTIFICATIONS);
      } finally {
        setLoading(false);
      }
    };

    fetchNotifications();
  }, []);

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Live Activity</Text>
          <Text style={styles.headerSubtitle}>Real-time updates for Sarah</Text>
        </View>

        <View style={styles.timeline}>
          {notifications.map((item, index) => (
            <View key={item.id} style={styles.notificationCard}>
              
              {/* Timeline Connector */}
              {index !== notifications.length - 1 && (
                <View style={styles.timelineLine} />
              )}
              
              <View style={styles.iconContainer}>
                <Text style={styles.iconText}>{item.icon}</Text>
              </View>
              
              <View style={styles.contentContainer}>
                <View style={styles.titleRow}>
                  <Text style={styles.title}>{item.title}</Text>
                  <Text style={styles.time}>{item.time}</Text>
                </View>
                <Text style={styles.message}>{item.message}</Text>
                
                {item.type === 'FINANCE' && (
                  <TouchableOpacity 
                    style={styles.actionButton}
                    onPress={() => navigation.navigate('Payment')}
                  >
                    <Text style={styles.actionButtonText}>View Receipt</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    marginBottom: 30,
    marginTop: 10,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 15,
    color: '#64748B',
    marginTop: 4,
  },
  timeline: {
    paddingLeft: 10,
  },
  notificationCard: {
    flexDirection: 'row',
    marginBottom: 24,
    position: 'relative',
  },
  timelineLine: {
    position: 'absolute',
    left: 23,
    top: 50,
    bottom: -24,
    width: 2,
    backgroundColor: '#E2E8F0',
    zIndex: 0,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
    zIndex: 1,
  },
  iconText: {
    fontSize: 20,
  },
  contentContainer: {
    flex: 1,
    marginLeft: 16,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 1,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    flex: 1,
  },
  time: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  message: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
  },
  actionButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  actionButtonText: {
    color: '#4F46E5',
    fontSize: 13,
    fontWeight: '600',
  }
});
