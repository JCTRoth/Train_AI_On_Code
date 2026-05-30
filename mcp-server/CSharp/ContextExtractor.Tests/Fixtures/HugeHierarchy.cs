using System;
using System.Collections.Generic;

public class OrderService
{
    public ProductCatalog Catalog { get; set; } = null!;
    public PaymentProcessor PaymentProcessor { get; set; } = null!;
    public InventoryManager Inventory { get; set; } = null!;
    public ShippingCoordinator Shipping { get; set; } = null!;
    public AuditLogger Audit { get; set; } = null!;
    public Dictionary<string, OrderRecord> Orders { get; } = new();
    public string Region { get; set; } = "eu";

    public static OrderService Create()
    {
        var service = new OrderService();
        var storage = new StorageBackend();
        var audit = new AuditLogger(storage);
        var catalog = new ProductCatalog(new SearchEngine(new IndexBuilder()), new CategoryCache(new ExpirationPolicy()));
        var inventory = new InventoryManager(new StockRepository(new DatabaseSession()), new NotificationHub(new MessageQueue()));
        var shipping = new ShippingCoordinator(new CarrierManager(new CarrierFactory()), new DeliveryScheduler(new TimeCalculator()));
        var payment = new PaymentProcessor(new GatewayConnector(new ConnectionPool()));

        service.Catalog = catalog;
        service.PaymentProcessor = payment;
        service.Inventory = inventory;
        service.Shipping = shipping;
        service.Audit = audit;
        payment.Owner = service;

        return service;
    }

    public OrderRecord CreateOrder(string customerId, decimal total)
    {
        var order = new OrderRecord(customerId, total);
        Orders[customerId] = order;
        return order;
    }

    public bool CancelOrder(string customerId)
    {
        return Orders.Remove(customerId);
    }

    public string TrackOrder(string customerId)
    {
        return Orders.ContainsKey(customerId) ? "in-progress" : "missing";
    }
}

public class ProductCatalog
{
    public SearchEngine SearchEngine { get; }
    public CategoryCache Cache { get; }

    public ProductCatalog(SearchEngine searchEngine, CategoryCache cache)
    {
        SearchEngine = searchEngine;
        Cache = cache;
    }

    public string SearchProducts(string query) => query;
    public string GetCategory(string productId) => productId;
}

public class PaymentProcessor
{
    public GatewayConnector Gateway { get; }
    public OrderService? Owner { get; set; }

    public PaymentProcessor(GatewayConnector gateway)
    {
        Gateway = gateway;
    }

    public bool Charge(decimal amount) => amount >= 0;
    public bool Refund(string paymentId) => !string.IsNullOrWhiteSpace(paymentId);
}

public class InventoryManager
{
    public StockRepository Repository { get; }
    public NotificationHub Hub { get; }
    public List<string> ReservedItems { get; } = new();

    public InventoryManager(StockRepository repository, NotificationHub hub)
    {
        Repository = repository;
        Hub = hub;
    }

    public bool ReserveStock(string sku, int amount) => amount > 0;
    public bool ReleaseStock(string sku) => !string.IsNullOrWhiteSpace(sku);
}

public class ShippingCoordinator
{
    public CarrierManager CarrierManager { get; }
    public DeliveryScheduler Scheduler { get; }

    public ShippingCoordinator(CarrierManager carrierManager, DeliveryScheduler scheduler)
    {
        CarrierManager = carrierManager;
        Scheduler = scheduler;
    }

    public string ScheduleShipment(string orderId) => orderId;
    public bool MarkDelivered(string orderId) => !string.IsNullOrWhiteSpace(orderId);
}

public class AuditLogger
{
    public StorageBackend Storage { get; }
    public Queue<string> Buffer { get; } = new();

    public AuditLogger(StorageBackend storage)
    {
        Storage = storage;
    }

    public void LogEvent(string message) { }
    public void Flush() { }
}

public class SearchEngine
{
    public IndexBuilder Builder { get; }

    public SearchEngine(IndexBuilder builder)
    {
        Builder = builder;
    }

    public string Query(string query) => query;
}

public class CategoryCache
{
    public ExpirationPolicy Policy { get; }
    public Dictionary<string, string> Items { get; } = new();

    public CategoryCache(ExpirationPolicy policy)
    {
        Policy = policy;
    }

    public void Invalidate(string key) { }
}

public class GatewayConnector
{
    public ConnectionPool Pool { get; }

    public GatewayConnector(ConnectionPool pool)
    {
        Pool = pool;
    }

    public string Send(decimal amount) => amount.ToString();
}

public class StockRepository
{
    public DatabaseSession Session { get; }

    public StockRepository(DatabaseSession session)
    {
        Session = session;
    }

    public int Load(string sku) => sku.Length;
}

public class NotificationHub
{
    public MessageQueue Queue { get; }
    public HashSet<string> Subscribers { get; } = new();

    public NotificationHub(MessageQueue queue)
    {
        Queue = queue;
    }

    public void Publish(string topic) { }
}

public class CarrierManager
{
    public CarrierFactory Factory { get; }

    public CarrierManager(CarrierFactory factory)
    {
        Factory = factory;
    }

    public string SelectCarrier(string region) => region;
}

public class DeliveryScheduler
{
    public TimeCalculator Calculator { get; }

    public DeliveryScheduler(TimeCalculator calculator)
    {
        Calculator = calculator;
    }

    public DateTime Estimate(string route) => DateTime.UtcNow;
}

public class StorageBackend
{
    public string Write(string payload) => payload;
}

public class IndexBuilder
{
    public void Rebuild() { }
}

public class ExpirationPolicy
{
    public TimeSpan Duration() => TimeSpan.FromMinutes(5);
}

public class ConnectionPool
{
    public int Size() => 4;
}

public class DatabaseSession
{
    public bool Open() => true;
}

public class MessageQueue
{
    public void Enqueue(string message) { }
}

public class CarrierFactory
{
    public string Create(string region) => region;
}

public class TimeCalculator
{
    public DateTime Predict() => DateTime.UtcNow;
}

public readonly record struct OrderRecord(string CustomerId, decimal Total);