"use client";

interface StepIndicatorProps {
  currentStep: number;
}

const steps = [
  { number: 1, label: "Connect" },
  { number: 2, label: "Select" },
  { number: 3, label: "Migrate" },
];

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {steps.map((step, i) => (
        <div key={step.number} className="flex items-center gap-2">
          <div
            className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
              step.number < currentStep
                ? "bg-green-500 text-white"
                : step.number === currentStep
                  ? "bg-netbird-400 text-white"
                  : "bg-nb-gray-700 text-nb-gray-500"
            }`}
          >
            {step.number < currentStep ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              step.number
            )}
          </div>
          <span
            className={`text-sm ${
              step.number === currentStep
                ? "font-medium text-nb-gray-100"
                : "text-nb-gray-500"
            }`}
          >
            {step.label}
          </span>
          {i < steps.length - 1 && (
            <div
              className={`w-12 h-0.5 ${
                step.number < currentStep ? "bg-green-500" : "bg-nb-gray-700"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
