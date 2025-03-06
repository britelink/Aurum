import {
  ChevronRight,
  Timer,
  DollarSign,
  TrendingUp,
  Check,
} from "lucide-react";
import Hero from "./components/Hero";
import InfoCard from "./components/InforCard";
import AurumButton from "@/components/AurumButton";
import PriceSimulator from "./components/PriceSimulator";

export default function Home() {
  return (
    <>
      <Hero
        title="Predict. Trade. Win."
        subtitle="Aurum Capital offers a new way to predict market movements with fixed-price bets and high returns on investment."
        secondaryCta="Learn More"
      />

      <section className="py-16 px-6 bg-gray-50 dark:bg-navy-900">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-serif font-bold mb-4">
              How Aurum Works
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
              Aurum is an online betting platform that allows users to predict
              market movements in a simple, fast, and rewarding way.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <InfoCard
              title="Quick 10-Second Sessions"
              description="Each game session lasts only 10 seconds followed by a 5-second cooldown, giving you multiple opportunities to win."
              icon={<Timer size={32} />}
            />
            <InfoCard
              title="Fixed Price Bets"
              description="Place bets in fixed lots of $1 and $2, making it easy to manage your trading strategy and bankroll."
              icon={<DollarSign size={32} />}
            />
            <InfoCard
              title="High ROI Potential"
              description="Win between 90% to over 100% returns on your initial bet with each successful prediction."
              icon={<TrendingUp size={32} />}
            />
          </div>
        </div>
      </section>

      <section className="py-16 px-6 bg-white dark:bg-navy-800">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-serif font-bold mb-4">
                Experience Our Platform
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-300 mb-6">
                Try our interactive demo to see how Aurum works. Predict whether
                the price index will move up or down within the 10-second
                window.
              </p>

              <ul className="space-y-3 mb-8">
                <li className="flex items-start">
                  <Check
                    size={20}
                    className="text-gold-500 mt-1 mr-2 flex-shrink-0"
                  />
                  <span className="text-gray-700 dark:text-gray-300">
                    Place a bet on the direction of the price movement
                  </span>
                </li>
                <li className="flex items-start">
                  <Check
                    size={20}
                    className="text-gold-500 mt-1 mr-2 flex-shrink-0"
                  />
                  <span className="text-gray-700 dark:text-gray-300">
                    Wait for the 10-second window to close
                  </span>
                </li>
                <li className="flex items-start">
                  <Check
                    size={20}
                    className="text-gold-500 mt-1 mr-2 flex-shrink-0"
                  />
                  <span className="text-gray-700 dark:text-gray-300">
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

      <section className="py-16 px-6 bg-navy-900 text-white">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="text-3xl font-serif font-bold mb-4">
            Ready to Start Trading?
          </h2>
          <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto">
            Join thousands of traders who are already experiencing the Aurum
            advantage with high returns and rapid trading sessions.
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

      <section className="py-16 px-6 bg-white dark:bg-navy-800">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-serif font-bold mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
              Get answers to the most common questions about Aurum Capital.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="bg-gray-50 dark:bg-navy-700 p-6 rounded-lg">
              <h3 className="text-xl font-medium mb-2">
                How do I deposit funds?
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                You can deposit funds using ECO-USD or directly transfer money
                between Aurum accounts. Our system ensures quick and secure
                transactions.
              </p>
            </div>

            <div className="bg-gray-50 dark:bg-navy-700 p-6 rounded-lg">
              <h3 className="text-xl font-medium mb-2">
                What is the minimum bet?
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                Aurum offers fixed bet lots of $1 and $2 only, making it easy to
                manage your trading strategy and risk.
              </p>
            </div>

            <div className="bg-gray-50 dark:bg-navy-700 p-6 rounded-lg">
              <h3 className="text-xl font-medium mb-2">
                How long does each session last?
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                Each trading session lasts 10 seconds for placing bets, followed
                by a 5-second cooldown period before the next session begins.
              </p>
            </div>

            <div className="bg-gray-50 dark:bg-navy-700 p-6 rounded-lg">
              <h3 className="text-xl font-medium mb-2">
                What returns can I expect?
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                Winning predictions can yield returns ranging from 90% up to
                more than 100% of your initial bet, depending on the session's
                distribution.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
