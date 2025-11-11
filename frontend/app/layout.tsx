import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Agent Buddy - Nigerian Property Search Assistant',
  description: 'Explore Nigerian properties with Agent Buddy, your AI-powered real estate co-pilot.',
  keywords: 'Agent Buddy, Nigeria, property, real estate, chat, AI assistant, Lagos, Abuja, Ibadan',
  viewport: 'width=device-width, initial-scale=1',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div id="root">
          {children}
        </div>
      </body>
    </html>
  )
}
