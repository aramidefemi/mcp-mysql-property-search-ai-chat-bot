import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Property Chat - Nigerian Property Search Assistant',
  description: 'Find your perfect property in Nigeria with our AI-powered chat assistant',
  keywords: 'Nigeria, property, real estate, chat, AI assistant, Lagos, Abuja, Ibadan',
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
