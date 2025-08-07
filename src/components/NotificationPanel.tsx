'use client'

import { useState, useEffect } from 'react'
import { useUserSession } from '@/contexts/UserSessionContext'
import { Bell, X, CheckCircle, AlertTriangle, Info, AlertCircle, ExternalLink } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function NotificationPanel() {
  const { 
    sessionData, 
    markNotificationRead, 
    clearNotifications, 
    getUnreadCount 
  } = useUserSession()
  
  const [isOpen, setIsOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const router = useRouter()

  const unreadCount = getUnreadCount()
  const notifications = showAll 
    ? sessionData.notifications 
    : sessionData.notifications.slice(0, 5)

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-400" />
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-400" />
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-400" />
      default:
        return <Info className="w-5 h-5 text-blue-400" />
    }
  }

  const getNotificationBgColor = (type: string) => {
    switch (type) {
      case 'success':
        return 'bg-green-500/10 border-green-500/20'
      case 'warning':
        return 'bg-yellow-500/10 border-yellow-500/20'
      case 'error':
        return 'bg-red-500/10 border-red-500/20'
      default:
        return 'bg-blue-500/10 border-blue-500/20'
    }
  }

  const handleNotificationClick = (notification: any) => {
    markNotificationRead(notification.id)
    
    if (notification.action?.href) {
      if (notification.action.href.startsWith('http')) {
        window.open(notification.action.href, '_blank')
      } else {
        router.push(notification.action.href)
        setIsOpen(false)
      }
    }
  }

  const formatTimeAgo = (date: Date) => {
    const now = new Date()
    const diffInMs = now.getTime() - date.getTime()
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60))
    const diffInHours = Math.floor(diffInMinutes / 60)
    const diffInDays = Math.floor(diffInHours / 24)

    if (diffInMinutes < 1) return 'Just now'
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`
    if (diffInHours < 24) return `${diffInHours}h ago`
    return `${diffInDays}d ago`
  }

  return (
    <div className="relative">
      {/* Notification Bell */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/10"
      >
        <Bell className="w-6 h-6" />
        {unreadCount > 0 && (
          <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
            <span className="text-xs text-white font-medium">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          </div>
        )}
      </button>

      {/* Notification Panel */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-neutral-800 border border-white/10 rounded-xl shadow-xl z-50 max-h-96 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <h3 className="text-lg font-semibold text-white">Notifications</h3>
            <div className="flex items-center space-x-2">
              {unreadCount > 0 && (
                <span className="text-xs text-gray-400">
                  {unreadCount} unread
                </span>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-6 text-center">
                <Bell className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                <p className="text-gray-400">No notifications yet</p>
                <p className="text-gray-500 text-sm">
                  Create tokens and trade to get started!
                </p>
              </div>
            ) : (
              <div className="space-y-1 p-2">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-3 rounded-lg border transition-all cursor-pointer ${
                      notification.read 
                        ? 'bg-white/5 border-white/10' 
                        : `${getNotificationBgColor(notification.type)} border`
                    } hover:bg-white/10`}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0 mt-0.5">
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className={`font-medium text-sm ${
                            notification.read ? 'text-gray-300' : 'text-white'
                          }`}>
                            {notification.title}
                          </h4>
                          {!notification.read && (
                            <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
                          )}
                        </div>
                        <p className={`text-sm ${
                          notification.read ? 'text-gray-400' : 'text-gray-300'
                        }`}>
                          {notification.message}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-gray-500">
                            {formatTimeAgo(notification.timestamp)}
                          </span>
                          {notification.action && (
                            <div className="flex items-center space-x-1 text-xs text-blue-400">
                              <span>{notification.action.label}</span>
                              <ExternalLink className="w-3 h-3" />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {sessionData.notifications.length > 0 && (
            <div className="p-3 border-t border-white/10 bg-white/5">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setShowAll(!showAll)}
                  className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {showAll ? 'Show Less' : `Show All (${sessionData.notifications.length})`}
                </button>
                <button
                  onClick={() => {
                    clearNotifications()
                    setIsOpen(false)
                  }}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Clear All
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  )
}