import { useOrders } from '../../hooks/useOrders';
import { useMenus } from '../../hooks/useMenus';

interface Props {
  deviceName: string;
}

export function KitchenTab({ deviceName: _ }: Props) {
  const { orders } = useOrders();
  const { menus } = useMenus();

  // Active orders: billing (dim) + cooking (normal)
  const activeOrders = orders.filter(o => o.status === 'billing' || o.status === 'cooking');

  // Determine menu columns (priority from menus table, fallback to fixed 2 items)
  const menuNames = menus.length > 0
    ? menus.map(m => m.name)
    : ['チョコバナナ', 'いちごバナナ'];

  // Calculate totals for each menu item across active orders
  const totals = menuNames.map(name => {
    return activeOrders.reduce((sum, order) => {
      const item = order.items?.find(i => i.menu_name === name);
      return sum + (item?.quantity ?? 0);
    }, 0);
  });

  return (
    <div className="tab-content kitchen-tab-container">
      <div className="kitchen-display-card">
        {activeOrders.length === 0 ? (
          <p className="empty-message empty-message--large">現在、調理待ちの注文はありません</p>
        ) : (
          <div className="kitchen-grid-table">
            {/* Header row */}
            <div className="kitchen-grid-row kitchen-grid-header">
              <div className="kitchen-grid-cell kitchen-grid-cell--ticket"></div>
              {menuNames.map(name => (
                <div key={name} className="kitchen-grid-cell kitchen-grid-cell--menu">
                  {name}
                </div>
              ))}
            </div>

            {/* Order rows */}
            <div className="kitchen-grid-body">
              {activeOrders.map(order => {
                const isBilling = order.status === 'billing';
                return (
                  <div
                    key={order.id}
                    className={`kitchen-grid-row ${isBilling ? 'kitchen-grid-row--dim' : ''}`}
                  >
                    <div className="kitchen-grid-cell kitchen-grid-cell--ticket">
                      #{order.ticket_number}
                      {isBilling && <span className="kitchen-billing-tag">会計中</span>}
                    </div>
                    {menuNames.map(name => {
                      const item = order.items?.find(i => i.menu_name === name);
                      const qty = item && item.quantity > 0 ? item.quantity : null;
                      return (
                        <div key={name} className="kitchen-grid-cell kitchen-grid-cell--qty">
                          {qty !== null ? qty : ''}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Total row */}
            <div className="kitchen-grid-row kitchen-grid-total">
              <div className="kitchen-grid-cell kitchen-grid-cell--ticket">合計</div>
              {totals.map((total, idx) => (
                <div key={menuNames[idx]} className="kitchen-grid-cell kitchen-grid-cell--qty">
                  {total}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

