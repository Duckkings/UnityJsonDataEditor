namespace GameFramework
{
    public readonly struct SubscriptionToken
    {
        internal SubscriptionToken(int id)
        {
            Id = id;
        }

        internal int Id { get; }

        public bool IsValid => Id != 0;
    }
}
