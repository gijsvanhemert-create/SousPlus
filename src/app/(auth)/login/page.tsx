import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen">
      {/* Formulier */}
      <div className="flex flex-1 items-center justify-center bg-canvas px-6 py-12">
        <LoginForm />
      </div>

      {/* Sfeerpaneel (verborgen op smal) */}
      <div className="relative hidden flex-1 overflow-hidden bg-forest min-[980px]:block">
        <div className="absolute inset-0 grid place-items-center p-16">
          <div className="max-w-md text-champagne">
            <div className="font-serif text-4xl font-semibold leading-tight">
              Je digitale sous-chef de cuisine.
            </div>
            <p className="mt-5 text-[15px] leading-relaxed text-[#9DB0A2]">
              Live foodcost en marges, receptuur-versiebeheer, smaakanalyse,
              HACCP-compliance en Chef Auguste — die het werk écht uitvoert.
            </p>
            <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-forest-line px-3 py-1.5 text-xs font-semibold text-champagne">
              Premium · B2B Kitchen Studio
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
