import React from 'react';
import Link from 'next/link';

interface ErrorPageProps {
  statusCode: number;
  title: string;
  description: string;
  icon: React.ReactNode;
}

export default function ErrorPageLayout({ statusCode, title, description, icon }: ErrorPageProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
      <div className="max-w-md w-full text-center">
        {/* Icon */}
        <div className="mb-8 flex justify-center">{icon}</div>

        {/* Status Code */}
        <h1 className="text-6xl font-bold text-slate-900 mb-4">{statusCode}</h1>

        {/* Title */}
        <h2 className="text-2xl md:text-3xl font-semibold text-slate-800 mb-3">{title}</h2>

        {/* Description */}
        <p className="text-slate-600 mb-8 text-base md:text-lg">{description}</p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to Home
          </Link>
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center justify-center px-6 py-3 bg-slate-200 text-slate-800 font-medium rounded-lg hover:bg-slate-300 transition-colors"
          >
            Go Back
          </button>
        </div>

        {/* Support */}
        <div className="mt-12 p-4 bg-white rounded-lg border border-slate-200">
          <p className="text-sm text-slate-600">
            Need help?{' '}
            <Link href="/support" className="text-blue-600 hover:text-blue-700 font-medium">
              Contact support
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
