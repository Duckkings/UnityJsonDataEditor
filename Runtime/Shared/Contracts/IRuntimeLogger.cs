namespace GameFramework
{
    public interface IRuntimeLogger
    {
        void Info(string message);

        void Warning(string message);

        void Error(string message);
    }
}
