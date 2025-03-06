import { Shield, Target, TrendingUp, Users, Award } from "lucide-react";
import Hero from "../components/Hero";
import AurumButton from "@/components/AurumButton";

export default function About() {
  return (
    <>
      <Hero
        title="About Aurum Capital"
        subtitle="Redefining the online betting experience with innovative, transparent, and rewarding prediction markets."
      />

      <section className="py-16 px-6 bg-white dark:bg-navy-800">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-serif font-bold mb-6">Our Vision</h2>
              <p className="text-lg text-gray-600 dark:text-gray-300 mb-6">
                Aurum Capital was founded with a clear vision: to create a
                betting platform that is fair, transparent, and rewarding for
                all participants.
              </p>
              <p className="text-lg text-gray-600 dark:text-gray-300 mb-6">
                Our innovative approach combines the excitement of rapid trading
                with the simplicity of binary prediction, allowing users to
                leverage their market intuition without complicated trading
                interfaces.
              </p>
              <p className="text-lg text-gray-600 dark:text-gray-300">
                We're committed to building a community of traders who can enjoy
                frequent opportunities to profit from their predictions while
                maintaining responsible gaming practices.
              </p>
            </div>

            <div className="bg-gray-50 dark:bg-navy-700 p-8 rounded-xl">
              <h3 className="text-2xl font-serif font-bold mb-6 text-gold-500">
                Key Advantages
              </h3>

              <div className="space-y-6">
                <div className="flex">
                  <div className="flex-shrink-0 mr-4">
                    <div className="w-12 h-12 rounded-full bg-gold-100 dark:bg-gold-900/20 flex items-center justify-center text-gold-500">
                      <Target size={24} />
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xl font-medium mb-2">
                      Precision Trading
                    </h4>
                    <p className="text-gray-600 dark:text-gray-300">
                      Simple up/down predictions with clear outcomes within
                      short 10-second intervals.
                    </p>
                  </div>
                </div>

                <div className="flex">
                  <div className="flex-shrink-0 mr-4">
                    <div className="w-12 h-12 rounded-full bg-gold-100 dark:bg-gold-900/20 flex items-center justify-center text-gold-500">
                      <TrendingUp size={24} />
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xl font-medium mb-2">High Returns</h4>
                    <p className="text-gray-600 dark:text-gray-300">
                      Potential to earn over 100% ROI on successful predictions
                      in just seconds.
                    </p>
                  </div>
                </div>

                <div className="flex">
                  <div className="flex-shrink-0 mr-4">
                    <div className="w-12 h-12 rounded-full bg-gold-100 dark:bg-gold-900/20 flex items-center justify-center text-gold-500">
                      <Shield size={24} />
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xl font-medium mb-2">Fair System</h4>
                    <p className="text-gray-600 dark:text-gray-300">
                      Transparent distribution of winnings with built-in
                      safeguards against market manipulation.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 px-6 bg-gray-50 dark:bg-navy-900">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-serif font-bold mb-4">How It Works</h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
              Understanding Aurum's unique betting mechanism and payout
              structure.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-12">
            <div className="bg-white dark:bg-navy-800 p-6 rounded-lg shadow-md">
              <h3 className="text-xl font-medium mb-4 border-b border-gray-200 dark:border-navy-600 pb-2">
                The Trading Session
              </h3>
              <ol className="space-y-4 list-decimal list-inside">
                <li className="text-gray-700 dark:text-gray-300">
                  Each session lasts for 10 seconds during which players can
                  place their bets
                </li>
                <li className="text-gray-700 dark:text-gray-300">
                  Players predict whether the price index will be above or below
                  the neutral axis after the movement period
                </li>
                <li className="text-gray-700 dark:text-gray-300">
                  After the active period, there's a 5-second cooldown before
                  the next session
                </li>
                <li className="text-gray-700 dark:text-gray-300">
                  Bets are available in fixed lots of $1 and $2 only
                </li>
              </ol>
            </div>

            <div className="bg-white dark:bg-navy-800 p-6 rounded-lg shadow-md">
              <h3 className="text-xl font-medium mb-4 border-b border-gray-200 dark:border-navy-600 pb-2">
                Winning & Payouts
              </h3>
              <ol className="space-y-4 list-decimal list-inside">
                <li className="text-gray-700 dark:text-gray-300">
                  Winners receive their share of the collective bet amount from
                  the losing side
                </li>
                <li className="text-gray-700 dark:text-gray-300">
                  Aurum takes an 8% fee from the winning pool
                </li>
                <li className="text-gray-700 dark:text-gray-300">
                  Winnings are distributed at a ratio of 65% to $2 bettors and
                  35% to $1 bettors
                </li>
                <li className="text-gray-700 dark:text-gray-300">
                  Returns can exceed 100% of your initial bet, making each
                  session highly rewarding
                </li>
              </ol>
            </div>
          </div>

          <div className="text-center">
            <AurumButton variant="primary" size="lg">
              Try It Now
            </AurumButton>
          </div>
        </div>
      </section>

      <section className="py-16 px-6 bg-navy-800 text-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-serif font-bold mb-4">Our Numbers</h2>
            <p className="text-lg text-gray-300 max-w-3xl mx-auto">
              Aurum Capital has been growing rapidly since its inception,
              offering exciting opportunities to traders worldwide.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="bg-navy-700 p-6 rounded-lg text-center">
              <div className="text-4xl font-bold text-gold-500 mb-2">
                5,760+
              </div>
              <div className="text-xl font-medium mb-1">Daily Sessions</div>
              <div className="text-gray-300">
                Trading opportunities every day
              </div>
            </div>

            <div className="bg-navy-700 p-6 rounded-lg text-center">
              <div className="text-4xl font-bold text-gold-500 mb-2">
                90-120%
              </div>
              <div className="text-xl font-medium mb-1">Average ROI</div>
              <div className="text-gray-300">For successful predictions</div>
            </div>

            <div className="bg-navy-700 p-6 rounded-lg text-center">
              <div className="text-4xl font-bold text-gold-500 mb-2">15</div>
              <div className="text-xl font-medium mb-1">Seconds</div>
              <div className="text-gray-300">Total cycle time per session</div>
            </div>

            <div className="bg-navy-700 p-6 rounded-lg text-center">
              <div className="text-4xl font-bold text-gold-500 mb-2">24/7</div>
              <div className="text-xl font-medium mb-1">Platform Access</div>
              <div className="text-gray-300">Trade anytime, anywhere</div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 px-6 bg-white dark:bg-navy-800">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="order-2 lg:order-1">
              <h3 className="text-2xl font-serif font-bold mb-6">
                Payment Options
              </h3>
              <p className="text-lg text-gray-600 dark:text-gray-300 mb-6">
                Aurum offers flexible and secure payment methods for deposits
                and withdrawals:
              </p>

              <div className="space-y-6 mb-8">
                <div className="bg-gray-50 dark:bg-navy-700 p-4 rounded-lg">
                  <h4 className="text-xl font-medium mb-2">ECO-USD</h4>
                  <p className="text-gray-600 dark:text-gray-300">
                    Convert cash to ECO-USD via any ECO-USD agent, then transfer
                    to your Aurum account for instant deposits.
                  </p>
                </div>

                <div className="bg-gray-50 dark:bg-navy-700 p-4 rounded-lg">
                  <h4 className="text-xl font-medium mb-2">Direct Transfers</h4>
                  <p className="text-gray-600 dark:text-gray-300">
                    Send money directly between Aurum accounts, allowing users
                    to exchange cash for aUSD without any platform intervention.
                  </p>
                </div>
              </div>

              <AurumButton variant="primary">Open Account Now</AurumButton>
            </div>

            <div className="order-1 lg:order-2 flex justify-center">
              <div className="bg-gray-50 dark:bg-navy-700 p-8 rounded-xl max-w-md w-full">
                <h3 className="text-2xl font-serif font-bold mb-6 text-gold-500 text-center">
                  Why Choose Aurum
                </h3>

                <div className="space-y-6">
                  <div className="flex items-center">
                    <Award className="text-gold-500 mr-4" size={24} />
                    <div className="text-lg text-gray-700 dark:text-gray-300">
                      Simple, intuitive trading interface
                    </div>
                  </div>

                  <div className="flex items-center">
                    <Award className="text-gold-500 mr-4" size={24} />
                    <div className="text-lg text-gray-700 dark:text-gray-300">
                      Transparent fee structure (8% on winning pools)
                    </div>
                  </div>

                  <div className="flex items-center">
                    <Award className="text-gold-500 mr-4" size={24} />
                    <div className="text-lg text-gray-700 dark:text-gray-300">
                      High potential returns on every session
                    </div>
                  </div>

                  <div className="flex items-center">
                    <Award className="text-gold-500 mr-4" size={24} />
                    <div className="text-lg text-gray-700 dark:text-gray-300">
                      Fixed bet sizes for optimal risk management
                    </div>
                  </div>

                  <div className="flex items-center">
                    <Award className="text-gold-500 mr-4" size={24} />
                    <div className="text-lg text-gray-700 dark:text-gray-300">
                      Secure payment methods and fast withdrawals
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 px-6 bg-navy-900 text-white">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="text-3xl font-serif font-bold mb-4">
            Join the Aurum Community
          </h2>
          <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto">
            Start trading now and experience the next generation of online
            betting with Aurum Capital.
          </p>

          <AurumButton variant="primary" size="lg">
            Create Your Account
          </AurumButton>
        </div>
      </section>
    </>
  );
}
