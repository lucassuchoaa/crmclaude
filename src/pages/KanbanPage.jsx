import { useState, useEffect } from 'react';
import { indicationsApi } from '../services/api';
import { Badge, Card, Button, Modal, Input } from '../components/ui';
import { useNotifications } from '../contexts/NotificationContext';

const COLUMNS = [
  { id: 'novo', title: 'Novo', color: 'bg-blue-500' },
  { id: 'em_contato', title: 'Em Contato', color: 'bg-cyan-500' },
  { id: 'proposta', title: 'Proposta', color: 'bg-yellow-500' },
  { id: 'negociacao', title: 'Negociacao', color: 'bg-orange-500' },
  { id: 'fechado', title: 'Fechado', color: 'bg-green-500' },
];

function KanbanPage() {
  const { toast } = useNotifications();
  const [columns, setColumns] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedCard, setSelectedCard] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [draggedCard, setDraggedCard] = useState(null);

  useEffect(() => {
    loadKanban();
  }, []);

  const loadKanban = async () => {
    try {
      const response = await indicationsApi.getKanban();
      setColumns(response.data.columns);
    } catch (_err) {
      toast.error('Erro ao carregar kanban');
    } finally {
      setLoading(false);
    }
  };

  const handleDragStart = (e, card) => {
    setDraggedCard(card);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e, targetStatus) => {
    e.preventDefault();

    if (!draggedCard || draggedCard.status === targetStatus) {
      setDraggedCard(null);
      return;
    }

    // Optimistic update
    setColumns(prev => {
      const newColumns = { ...prev };
      newColumns[draggedCard.status] = newColumns[draggedCard.status].filter(
        c => c.id !== draggedCard.id
      );
      newColumns[targetStatus] = [
        { ...draggedCard, status: targetStatus },
        ...newColumns[targetStatus],
      ];
      return newColumns;
    });

    try {
      await indicationsApi.update(draggedCard.id, { status: targetStatus });
      toast.success('Status atualizado!');
    } catch (_err) {
      toast.error('Erro ao atualizar status');
      loadKanban(); // Revert on error
    }

    setDraggedCard(null);
  };

  const openCardDetails = (card) => {
    setSelectedCard(card);
    setShowModal(true);
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value || 0);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Kanban
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Arraste os cards para alterar o status
          </p>
        </div>
        <Button onClick={() => setShowNewModal(true)}>
          + Nova Indicacao
        </Button>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 min-h-[calc(100vh-250px)]">
          {COLUMNS.map((column) => (
            <div
              key={column.id}
              className="flex-shrink-0 w-80"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, column.id)}
            >
              {/* Column Header */}
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-3 h-3 rounded-full ${column.color}`} />
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                  {column.title}
                </h3>
                <span className="ml-auto px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 rounded-full text-gray-600 dark:text-gray-400">
                  {columns[column.id]?.length || 0}
                </span>
              </div>

              {/* Column Content */}
              <div className="space-y-3 bg-gray-100 dark:bg-gray-800/50 rounded-lg p-3 min-h-[200px]">
                {columns[column.id]?.map((card) => (
                  <div
                    key={card.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, card)}
                    onClick={() => openCardDetails(card)}
                    className={`
                      bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm
                      border border-gray-200 dark:border-gray-700
                      cursor-pointer hover:shadow-md transition-shadow
                      ${draggedCard?.id === card.id ? 'opacity-50' : ''}
                    `}
                  >
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                      {card.razao_social}
                    </h4>
                    {card.nome_fantasia && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                        {card.nome_fantasia}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                        {formatCurrency(card.value)}
                      </span>
                      <div className="flex items-center gap-1">
                        <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs">
                          {card.owner_avatar || card.owner_name?.charAt(0) || '?'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {columns[column.id]?.length === 0 && (
                  <p className="text-center text-gray-400 dark:text-gray-500 py-8 text-sm">
                    Nenhuma indicacao
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Card Details Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Detalhes da Indicacao"
        size="lg"
      >
        {selectedCard && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-500 dark:text-gray-400">Razao Social</label>
                <p className="font-medium text-gray-900 dark:text-gray-100">{selectedCard.razao_social}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500 dark:text-gray-400">Nome Fantasia</label>
                <p className="font-medium text-gray-900 dark:text-gray-100">{selectedCard.nome_fantasia || '-'}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500 dark:text-gray-400">CNPJ</label>
                <p className="font-medium text-gray-900 dark:text-gray-100">{selectedCard.cnpj}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500 dark:text-gray-400">Valor</label>
                <p className="font-medium text-green-600 dark:text-green-400">{formatCurrency(selectedCard.value)}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500 dark:text-gray-400">Status</label>
                <div className="mt-1">
                  <Badge.Status status={selectedCard.status} />
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-500 dark:text-gray-400">Responsavel</label>
                <p className="font-medium text-gray-900 dark:text-gray-100">{selectedCard.owner_name}</p>
              </div>
            </div>

            {/* Contact Info */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Contato</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400">Nome</label>
                  <p className="text-gray-900 dark:text-gray-100">{selectedCard.contato_nome || '-'}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400">Telefone</label>
                  <p className="text-gray-900 dark:text-gray-100">{selectedCard.contato_telefone || '-'}</p>
                </div>
                <div className="col-span-2">
                  <label className="text-sm text-gray-500 dark:text-gray-400">Email</label>
                  <p className="text-gray-900 dark:text-gray-100">{selectedCard.contato_email || '-'}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* New Indication Modal */}
      <NewIndicationModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        onSuccess={() => {
          setShowNewModal(false);
          loadKanban();
          toast.success('Indicacao criada com sucesso!');
        }}
      />
    </div>
  );
}

function NewIndicationModal({ isOpen, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    cnpj: '',
    razao_social: '',
    nome_fantasia: '',
    contato_nome: '',
    contato_telefone: '',
    contato_email: '',
    value: '',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await indicationsApi.create({
        ...formData,
        value: parseFloat(formData.value) || 0,
      });
      onSuccess();
      setFormData({
        cnpj: '',
        razao_social: '',
        nome_fantasia: '',
        contato_nome: '',
        contato_telefone: '',
        contato_email: '',
        value: '',
      });
    } catch (_err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Nova Indicacao"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button loading={loading} onClick={handleSubmit}>Criar</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="CNPJ"
            value={formData.cnpj}
            onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
            placeholder="00.000.000/0000-00"
            required
          />
          <Input
            label="Valor Estimado"
            type="number"
            value={formData.value}
            onChange={(e) => setFormData({ ...formData, value: e.target.value })}
            placeholder="0.00"
          />
        </div>

        <Input
          label="Razao Social"
          value={formData.razao_social}
          onChange={(e) => setFormData({ ...formData, razao_social: e.target.value })}
          required
        />

        <Input
          label="Nome Fantasia"
          value={formData.nome_fantasia}
          onChange={(e) => setFormData({ ...formData, nome_fantasia: e.target.value })}
        />

        <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
          <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Contato</h4>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Nome do Contato"
              value={formData.contato_nome}
              onChange={(e) => setFormData({ ...formData, contato_nome: e.target.value })}
            />
            <Input
              label="Telefone"
              value={formData.contato_telefone}
              onChange={(e) => setFormData({ ...formData, contato_telefone: e.target.value })}
            />
          </div>
          <Input
            label="Email"
            type="email"
            value={formData.contato_email}
            onChange={(e) => setFormData({ ...formData, contato_email: e.target.value })}
            containerClassName="mt-4"
          />
        </div>
      </form>
    </Modal>
  );
}

export default KanbanPage;
