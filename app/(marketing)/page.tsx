import { Timer, DollarSign, TrendingUp, Check } from "lucide-react";
import Hero from "./components/Hero";

import AurumButton from "@/components/AurumButton";
import PriceSimulator from "./components/PriceSimulator";
import InfoCard from "./components/InforCard";

export default function Home() {
  return (
    <>
      <Hero
        title="Predict. Bet. Win."
        subtitle="Penny Game offers a new way to predict market movements with fixed-price bets and high returns on investment."
        secondaryCta="Learn More"
        showChart={false}
      />

      <section className="py-16 px-6 bg-gradient-to-br from-blue-50/80 to-slate-100/80 dark:from-slate-900 dark:to-blue-950/80">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-serif font-bold mb-4 text-blue-800 dark:text-blue-300">
              How Penny Game Works
            </h2>
            <p className="text-lg text-blue-700 dark:text-blue-300 max-w-3xl mx-auto">
              Penny Game is an online betting platform that allows users to
              predict market movements in a simple, fast, and rewarding way.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <InfoCard
              title="Quick 10-Second Sessions"
              description="Each game session lasts only 10 seconds followed by a 5-second cooldown, giving you multiple opportunities to win."
              icon={<Timer size={32} />}
              className="bg-white dark:bg-slate-900/90 shadow-md hover:shadow-lg"
            />
            <InfoCard
              title="Fixed Price Bets"
              description="Place bets in fixed lots of $1 and $2, making it easy to manage your trading strategy and bankroll."
              icon={<DollarSign size={32} />}
              className="bg-white dark:bg-slate-900/90 shadow-md hover:shadow-lg"
            />
            <InfoCard
              title="High ROI Potential"
              description="Win between 90% to over 100% returns on your initial bet with each successful prediction."
              icon={<TrendingUp size={32} />}
              className="bg-white dark:bg-slate-900/90 shadow-md hover:shadow-lg"
            />
          </div>
        </div>
      </section>

      <section className="py-16 px-6 bg-gradient-to-br from-slate-100 to-blue-50 dark:from-slate-900 dark:to-blue-950/70">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-serif font-bold mb-4 text-blue-800 dark:text-blue-300">
                Experience Our Platform
              </h2>
              <p className="text-lg text-slate-600 dark:text-slate-300 mb-6">
                Try our interactive demo to see how Penny Game works. Predict
                whether the price index will move up or down within the
                10-second window.
              </p>

              <ul className="space-y-3 mb-8">
                <li className="flex items-start">
                  <Check
                    size={20}
                    className="text-emerald-500 dark:text-emerald-400 mt-1 mr-2 flex-shrink-0"
                  />
                  <span className="text-slate-600 dark:text-slate-300">
                    Place a bet on the direction of the price movement
                  </span>
                </li>
                <li className="flex items-start">
                  <Check
                    size={20}
                    className="text-emerald-500 dark:text-emerald-400 mt-1 mr-2 flex-shrink-0"
                  />
                  <span className="text-slate-600 dark:text-slate-300">
                    Wait for the 10-second window to close
                  </span>
                </li>
                <li className="flex items-start">
                  <Check
                    size={20}
                    className="text-emerald-500 dark:text-emerald-400 mt-1 mr-2 flex-shrink-0"
                  />
                  <span className="text-slate-600 dark:text-slate-300">
                    Win up to 100% return if your prediction is correct
                  </span>
                </li>
              </ul>

              <AurumButton variant="primary">Open Real Account</AurumButton>
            </div>

            <div className="flex justify-center">
              <PriceSimulator />
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 px-6 bg-blue-900 dark:bg-blue-950 text-white">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="text-3xl font-serif font-bold mb-4 text-blue-100">
            Ready to Start Betting?
          </h2>
          <p className="text-lg text-blue-200 mb-8 max-w-2xl mx-auto">
            Join thousands of traders who are already experiencing the Penny
            Game advantage with high returns and rapid trading sessions.
          </p>

          <div className="flex flex-col sm:flex-row justify-center space-y-4 sm:space-y-0 sm:space-x-4">
            <AurumButton variant="primary" size="lg">
              Create Account
            </AurumButton>
            <AurumButton variant="outline" size="lg">
              Learn More
            </AurumButton>
          </div>
        </div>
      </section>

      <section className="py-16 px-6 bg-slate-100 dark:bg-slate-900">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-serif font-bold mb-4 text-blue-800 dark:text-blue-300">
              Frequently Asked Questions
            </h2>
            <p className="text-lg text-slate-600 dark:text-slate-300 max-w-3xl mx-auto">
              Get answers to the most common questions about Penny Game.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="bg-white dark:bg-blue-900/30 p-6 rounded-lg shadow-md">
              <h3 className="text-xl font-medium mb-2 text-blue-700 dark:text-blue-200">
                How do I deposit funds?
              </h3>
              <p className="text-slate-600 dark:text-slate-300">
                You can deposit funds using ECO-USD or directly transfer money
                between Penny accounts. Our system ensures quick and secure
                transactions.
              </p>
            </div>

            <div className="bg-white dark:bg-blue-900/30 p-6 rounded-lg shadow-md">
              <h3 className="text-xl font-medium mb-2 text-blue-700 dark:text-blue-200">
                What is the minimum bet?
              </h3>
              <p className="text-slate-600 dark:text-slate-300">
                Penny Game offers fixed bet lots of $1 and $2 only, making it
                easy to manage your trading strategy and risk.
              </p>
            </div>

            <div className="bg-white dark:bg-blue-900/30 p-6 rounded-lg shadow-md">
              <h3 className="text-xl font-medium mb-2 text-blue-700 dark:text-blue-200">
                How long does each session last?
              </h3>
              <p className="text-slate-600 dark:text-slate-300">
                Each trading session lasts 10 seconds for placing bets, followed
                by a 5-second cooldown period before the next session begins.
              </p>
            </div>

            <div className="bg-white dark:bg-blue-900/30 p-6 rounded-lg shadow-md">
              <h3 className="text-xl font-medium mb-2 text-blue-700 dark:text-blue-200">
                What returns can I expect?
              </h3>
              <p className="text-slate-600 dark:text-slate-300">
                Winning predictions can yield returns ranging from 90% up to
                more than 100% of your initial bet, depending on the
                session&apos;s distribution.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
